// CourtSide's own native fix (Nov 4, owner: "the scrolling throughout the app should never be this laggy"):
// React Native's scroll views stop walking the whole app's screen for nothing.
//
// What React Native does today: after every screen update (each React redraw, each animation frame that is not
// sent straight to the screen) and every 44 points of any scroll, every mounted scroll view walks every view
// inside it (RCTScrollViewComponentView's `_remountChildren`), converting a rectangle per view. The walk exists
// only for `removeClippedSubviews`, which takes views far off screen out of the screen list. Nothing in CourtSide
// turns it on, so every walk changes nothing, and with the four tabs, the kept feeds and the grids all mounted
// it cost about half of every screen update on the Simulator (Nov 2 sample: 187 of 384 ms a second).
//
// What this does: a scroll view now walks only when a view that does take children off screen
// (`removeClippedSubviews` on) could be reached by its walk: one inside it, or one not on screen at all (it might
// be). Otherwise the walk is skipped, which is exactly what it would have done. If one ever appears, the walks run
// as before. Nothing on screen changes: the views shown, their places and their order are the same.
//
// Why here and not a patch of React Native's file: Expo builds the iPhone app with React Native's core already
// compiled (React.xcframework), so an edit to its .mm file is never built. This swaps the one method at launch
// instead, and steps aside (React Native unchanged, one line in the log) if anything it expects is missing.
//
// iPhone only, from the next App Store build (it is native code, so an over-the-air update cannot bring it).

#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#import <os/log.h>

@interface CSScrollClipWalk : NSObject
@end

static IMP CSOriginalRemountChildren = NULL;
static IMP CSOriginalUpdateClipState = NULL;
static ptrdiff_t CSClipFlagOffset = 0;
// Every view that has turned removeClippedSubviews on (held weakly; a view gone from memory drops out by itself).
static NSHashTable<UIView *> *CSClippers = nil;

static os_log_t CSLog(void)
{
  static os_log_t log;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    log = os_log_create("co.courtside.app", "smooth-scroll");
  });
  return log;
}

// RCTViewComponentView's own `_removeClippedSubviews`, read where the class keeps it.
static BOOL CSClipsSubviews(__unsafe_unretained UIView *view)
{
  return *(BOOL *)((uint8_t *)(__bridge void *)view + CSClipFlagOffset);
}

// Whether this scroll view's walk could reach a view that takes its children off screen.
static BOOL CSWalkCanMatter(__unsafe_unretained UIView *scrollView)
{
  for (UIView *view in CSClippers) {
    if (!CSClipsSubviews(view)) {
      continue; // turned off again, or reused for another view
    }
    if (view.window == nil || [view isDescendantOfView:scrollView]) {
      return YES;
    }
  }
  return NO;
}

static void CSRemountChildren(id self, SEL _cmd)
{
  if (!CSWalkCanMatter(self)) {
    return;
  }
  ((void (*)(id, SEL))CSOriginalRemountChildren)(self, _cmd);
}

static void CSUpdateClipState(id self, SEL _cmd)
{
  ((void (*)(id, SEL))CSOriginalUpdateClipState)(self, _cmd);
  if (CSClipsSubviews(self) && ![CSClippers containsObject:self]) {
    [CSClippers addObject:self];
    static dispatch_once_t once;
    dispatch_once(&once, ^{
      os_log(CSLog(), "[smooth-scroll] a view takes its children off screen: scroll walks run where it can be reached");
    });
  }
}

// The method the class itself defines (not one it inherits), or NULL.
static Method CSOwnMethod(Class cls, SEL selector)
{
  unsigned int count = 0;
  Method *methods = class_copyMethodList(cls, &count);
  Method found = NULL;
  for (unsigned int i = 0; i < count; i++) {
    if (method_getName(methods[i]) == selector) {
      found = methods[i];
      break;
    }
  }
  free(methods);
  return found;
}

static BOOL CSTakesNoArguments(Method method)
{
  const char *types = method_getTypeEncoding(method);
  return types != NULL && types[0] == 'v' && method_getNumberOfArguments(method) == 2;
}

@implementation CSScrollClipWalk

+ (void)load
{
  Class scrollClass = NSClassFromString(@"RCTScrollViewComponentView");
  Class viewClass = NSClassFromString(@"RCTViewComponentView");
  if (scrollClass == Nil || viewClass == Nil || ![scrollClass isSubclassOfClass:viewClass]) {
    os_log(CSLog(), "[smooth-scroll] unchanged: React Native's view classes not found");
    return;
  }
  Ivar clipFlag = class_getInstanceVariable(viewClass, "_removeClippedSubviews");
  const char *flagType = clipFlag != NULL ? ivar_getTypeEncoding(clipFlag) : NULL;
  if (flagType == NULL || (strcmp(flagType, "B") != 0 && strcmp(flagType, "c") != 0)) {
    os_log(CSLog(), "[smooth-scroll] unchanged: removeClippedSubviews flag not found");
    return;
  }
  Method remount = CSOwnMethod(scrollClass, NSSelectorFromString(@"_remountChildren"));
  Method clipState = CSOwnMethod(viewClass, NSSelectorFromString(@"_updateRemoveClippedSubviewsState"));
  if (remount == NULL || clipState == NULL || !CSTakesNoArguments(remount) || !CSTakesNoArguments(clipState)) {
    os_log(CSLog(), "[smooth-scroll] unchanged: React Native's clipping methods not found");
    return;
  }
  CSClipFlagOffset = ivar_getOffset(clipFlag);
  CSClippers = [NSHashTable weakObjectsHashTable];
  // Watch for views turning the flag on first, so no scroll view can skip a walk one of them needs.
  CSOriginalUpdateClipState = method_setImplementation(clipState, (IMP)CSUpdateClipState);
  CSOriginalRemountChildren = method_setImplementation(remount, (IMP)CSRemountChildren);
  os_log(CSLog(), "[smooth-scroll] on: scroll views walk their views only where removeClippedSubviews can be reached");
}

@end
