# CourtSide's own native module: the chat's emoji button opens the iPhone's
# own emoji keyboard (see EmojiKeyboardSwitch.swift). Linked into the iPhone
# build automatically (Expo's autolinking finds every folder in modules/).
Pod::Spec.new do |s|
  s.name           = 'EmojiKeyboard'
  s.version        = '1.0.0'
  s.summary        = 'Opens the iPhone emoji keyboard on a text box, for CourtSide.'
  s.description    = 'Lets the chat emoji button switch the focused message box straight to the system emoji keyboard.'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'CourtSide'
  s.homepage       = 'https://oatmealandsilk-dotcom.github.io/Courtside/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
