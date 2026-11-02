// simtap.m: a real touch on a booted Simulator (finger down, held, up), through SimulatorKit's HID client as idb does, so it
// goes through iOS's own touch system (unlike simDriver commands, which call the app directly). The Mac is not touched.
// Build once: clang -fobjc-arc -framework Foundation -framework CoreGraphics -o simtap scripts/sim-zoom/simtap.m
// Use: simtap UDID x y [holdMs=60] [screenW=402 screenH=874]   (x, y in points; prints the wall clock of the touch-down)
// Xcode 27.1 + iOS 27.0 Simulator (Nov 2). Private API: if a later Xcode changes it, the tap silently does nothing.
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <dlfcn.h>
#import <objc/message.h>
#import <mach/mach.h>
#import <mach/mach_time.h>

#pragma pack(push, 4)
typedef struct {
  unsigned int field1; unsigned int field2; unsigned int field3;
  double xRatio; double yRatio;
  double field6; double field7; double field8;
  unsigned int field9; unsigned int field10; unsigned int field11; unsigned int field12; unsigned int field13;
  double field14; double field15; double field16; double field17; double field18;
} IndigoTouch;
typedef struct { unsigned int field1; unsigned long long timestamp; unsigned int field3; IndigoTouch touch; } IndigoPayload;
typedef struct { mach_msg_header_t header; unsigned int innerSize; unsigned char eventType; IndigoPayload payload; } IndigoMessage;
#pragma pack(pop)

typedef IndigoMessage *(*MouseFn)(CGPoint *, CGPoint *, uint32_t, uint64_t, CGSize, uint32_t);
static MouseFn mouse;
static id hid;

static void send(CGPoint ratio, BOOL down) {
  IndigoMessage *m = mouse(&ratio, NULL, 0x32, down ? 1 /*LeftMouseDown*/ : 2 /*LeftMouseUp*/, CGSizeMake(1, 1), 0);
  m->payload.touch.xRatio = ratio.x;
  m->payload.touch.yRatio = ratio.y;
  size_t stride = sizeof(IndigoPayload);
  size_t size = sizeof(IndigoMessage) + stride;
  IndigoMessage *c = calloc(1, size);
  memcpy(c, m, sizeof(IndigoMessage));
  c->innerSize = sizeof(IndigoPayload);
  c->eventType = 2; // touch
  c->payload.field1 = 0x0000000b;
  c->payload.timestamp = mach_absolute_time();
  char *p = (char *)&c->payload;
  memcpy(p + stride, p, stride);
  IndigoPayload *second = (IndigoPayload *)(p + stride);
  second->touch.field1 = 0x00000001;
  second->touch.field2 = 0x00000002;
  free(m);
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  void (^done)(NSError *) = ^(NSError *e) { if (e) fprintf(stderr, "send error %s\n", e.description.UTF8String); dispatch_semaphore_signal(sem); };
  ((void (*)(id, SEL, void *, BOOL, dispatch_queue_t, id))objc_msgSend)(hid, NSSelectorFromString(@"sendWithMessage:freeWhenDone:completionQueue:completion:"), c, YES, dispatch_get_global_queue(0, 0), done);
  dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));
}

int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc < 4) { fprintf(stderr, "usage: simtap UDID x y [holdMs] [screenW screenH]\n"); return 2; }
    NSString *udid = @(argv[1]);
    double x = atof(argv[2]), y = atof(argv[3]);
    int hold = argc > 4 ? atoi(argv[4]) : 60;
    double W = argc > 6 ? atof(argv[5]) : 402, H = argc > 6 ? atof(argv[6]) : 874;
    if (!dlopen("/Library/Developer/PrivateFrameworks/CoreSimulator.framework/CoreSimulator", RTLD_NOW)) { fprintf(stderr, "no CoreSimulator\n"); return 1; }
    void *sk = dlopen("/Applications/Xcode.app/Contents/SharedFrameworks/SimulatorKit.framework/SimulatorKit", RTLD_NOW);
    if (!sk) { fprintf(stderr, "no SimulatorKit %s\n", dlerror()); return 1; }
    mouse = (MouseFn)dlsym(sk, "IndigoHIDMessageForMouseNSEvent");
    NSError *err = nil;
    id ctx = ((id (*)(id, SEL, id, NSError **))objc_msgSend)(NSClassFromString(@"SimServiceContext"), NSSelectorFromString(@"sharedServiceContextForDeveloperDir:error:"), @"/Applications/Xcode.app/Contents/Developer", &err);
    id set = ((id (*)(id, SEL, NSError **))objc_msgSend)(ctx, NSSelectorFromString(@"defaultDeviceSetWithError:"), &err);
    id dev = nil;
    for (id d in [set valueForKey:@"devices"]) if ([[[d valueForKey:@"UDID"] UUIDString] isEqualToString:udid]) dev = d;
    if (!dev) { fprintf(stderr, "no device %s\n", argv[1]); return 1; }
    Class hc = NSClassFromString(@"_TtC12SimulatorKit24SimDeviceLegacyHIDClient");
    if (!hc) hc = NSClassFromString(@"SimulatorKit.SimDeviceLegacyHIDClient");
    if (!hc) { fprintf(stderr, "no HID client class\n"); return 1; }
    hid = ((id (*)(id, SEL, id, NSError **))objc_msgSend)([hc alloc], NSSelectorFromString(@"initWithDevice:error:"), dev, &err);
    if (!hid) { fprintf(stderr, "no HID client %s\n", err.description.UTF8String); return 1; }
    CGPoint r = CGPointMake(x / W, y / H);
    struct timespec ts; clock_gettime(CLOCK_REALTIME, &ts);
    send(r, YES);
    usleep(hold * 1000);
    send(r, NO);
    printf("%ld.%03ld tapped %.0f,%.0f\n", (long)ts.tv_sec, ts.tv_nsec / 1000000, x, y);
  }
  return 0;
}
