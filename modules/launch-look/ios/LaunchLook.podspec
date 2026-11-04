# CourtSide's own native module: the launch screen in the look the player picked, not the phone's
# light or dark mode (see LaunchLook.swift). Linked into the iPhone build automatically (Expo's
# autolinking finds every folder in modules/).
Pod::Spec.new do |s|
  s.name           = 'LaunchLook'
  s.version        = '1.0.0'
  s.summary        = 'The launch screen in the look picked in CourtSide.'
  s.description    = 'Gives the launch screen the light or dark look picked in the app, from the first frame where iOS allows it.'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'CourtSide'
  s.homepage       = 'https://oatmealandsilk-dotcom.github.io/Courtside/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'UIKit', 'ImageIO', 'UniformTypeIdentifiers'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
