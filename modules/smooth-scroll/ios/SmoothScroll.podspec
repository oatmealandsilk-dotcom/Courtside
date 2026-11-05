# CourtSide's own native fix: React Native's scroll views stop walking every view inside them after each screen
# update when that walk can change nothing (see CSScrollClipWalk.m). No JavaScript side. Linked into the iPhone build
# automatically (Expo's autolinking finds every folder in modules/); the -ObjC link flag every CocoaPods app gets
# keeps its class, whose +load puts the fix in before the first screen is drawn.
Pod::Spec.new do |s|
  s.name           = 'SmoothScroll'
  s.version        = '1.0.0'
  s.summary        = 'Scroll views skip the clipped-subviews walk when it can do nothing, for CourtSide.'
  s.description    = 'Skips React Native ScrollView clipped-subviews walks unless a view with removeClippedSubviews could be reached.'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'CourtSide'
  s.homepage       = 'https://oatmealandsilk-dotcom.github.io/Courtside/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.frameworks = 'UIKit'

  s.source_files = '**/*.{h,m}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
