# CourtSide's own native module: a "Workout detected" alert the moment Apple
# Health saves a workout (see WorkoutWatcher.swift). Linked into the iPhone
# build automatically (Expo's autolinking finds every folder in modules/).
Pod::Spec.new do |s|
  s.name           = 'WorkoutWatch'
  s.version        = '1.0.0'
  s.summary        = 'Workout detected alerts from Apple Health, for CourtSide.'
  s.description    = 'Watches Apple Health for new workouts in the background and puts up a local alert to log them in CourtSide.'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'CourtSide'
  s.homepage       = 'https://oatmealandsilk-dotcom.github.io/Courtside/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit', 'UserNotifications'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
