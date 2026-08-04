include_guard(GLOBAL)

function(project_classify_c_compiler output_variable)
  if(CMAKE_C_COMPILER_ID STREQUAL "Clang" AND
     CMAKE_C_COMPILER_FRONTEND_VARIANT STREQUAL "GNU")
    set(_family clang)
  elseif(CMAKE_C_COMPILER_ID STREQUAL "GNU")
    set(_family gcc)
  elseif(PROJECT_ALLOW_UNVERIFIED_COMPILER)
    message(WARNING
      "Unverified C compiler '${CMAKE_C_COMPILER_ID}' with frontend "
      "'${CMAKE_C_COMPILER_FRONTEND_VARIANT}': project warning policy is disabled")
    set(_family unverified)
  else()
    message(FATAL_ERROR
      "Unsupported C compiler '${CMAKE_C_COMPILER_ID}' with frontend "
      "'${CMAKE_C_COMPILER_FRONTEND_VARIANT}'. The strict profiles support "
      "upstream Clang's GNU frontend and GCC only. Set "
      "PROJECT_ALLOW_UNVERIFIED_COMPILER=ON only for an explicitly unverified build.")
  endif()

  set(${output_variable} "${_family}" PARENT_SCOPE)
endfunction()

function(project_apply_c_standards target feature_scope)
  set_target_properties(${target} PROPERTIES
    C_STANDARD 99
    C_STANDARD_REQUIRED YES
    C_EXTENSIONS NO
  )
  target_compile_features(${target} ${feature_scope} c_std_99)

  project_classify_c_compiler(_family)
  if(_family STREQUAL "unverified")
    return()
  endif()

  target_compile_options(${target} PRIVATE
    -Wall
    -Wextra
    -Wpedantic
    -Wconversion
    -Wsign-conversion
    -Wshadow
    -Wstrict-prototypes
    -Wmissing-prototypes
    -Wformat=2
    -Wformat-security
    -Wundef
    -Wvla
    -Walloca
    -Wcast-qual
    -Wpointer-arith
    -Wimplicit-fallthrough
    -Wswitch-enum
    -Wdate-time
    -Werror=implicit-function-declaration
    -Werror=incompatible-pointer-types
    -Werror=int-conversion
    -fno-common
  )

  if(_family STREQUAL "clang")
    target_compile_options(${target} PRIVATE
      -Wcast-align
      -Wcast-function-type-strict
      -Wcomma
      -Wdeprecated-non-prototype
      -Wmissing-variable-declarations
      -Wshift-sign-overflow
    )
  elseif(_family STREQUAL "gcc")
    target_compile_options(${target} PRIVATE
      -Wcast-align=strict
      -Wcast-function-type
      -Wduplicated-cond
      -Wold-style-definition
      -Wshift-overflow=2
      -Wuse-after-free=2
      "$<$<OR:$<CONFIG:Release>,$<CONFIG:RelWithDebInfo>>:-Wnull-dereference>"
    )
  endif()

  if(PROJECT_WERROR)
    target_compile_options(${target} PRIVATE -Werror)
  endif()
endfunction()

function(_project_assert_c_standards_in_directory directory)
  get_property(_external DIRECTORY "${directory}"
    PROPERTY PROJECT_C_STANDARDS_EXTERNAL)
  if(_external)
    return()
  endif()

  get_property(_directory_targets DIRECTORY "${directory}"
    PROPERTY BUILDSYSTEM_TARGETS)
  foreach(_target IN LISTS _directory_targets)
    get_target_property(_type ${_target} TYPE)
    if(_type STREQUAL "EXECUTABLE" OR _type STREQUAL "STATIC_LIBRARY" OR
       _type STREQUAL "SHARED_LIBRARY" OR _type STREQUAL "MODULE_LIBRARY" OR
       _type STREQUAL "OBJECT_LIBRARY")
      get_target_property(_applied ${_target} PROJECT_C_STANDARDS_APPLIED)
      if(NOT _applied)
        message(FATAL_ERROR
          "Owned compiled target '${_target}' did not call project_apply_common; "
          "its language, platform, warning, and analyzer contracts would be absent")
      endif()
    endif()
  endforeach()

  get_property(_subdirectories DIRECTORY "${directory}" PROPERTY SUBDIRECTORIES)
  foreach(_subdirectory IN LISTS _subdirectories)
    _project_assert_c_standards_in_directory("${_subdirectory}")
  endforeach()
endfunction()

function(project_exclude_c_standards_directory directory reason)
  string(STRIP "${reason}" _reason)
  if(_reason STREQUAL "")
    message(FATAL_ERROR
      "project_exclude_c_standards_directory requires a nonempty reason")
  endif()
  get_property(_excluded_source DIRECTORY "${directory}" PROPERTY SOURCE_DIR)
  if(_excluded_source STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    message(FATAL_ERROR
      "project_exclude_c_standards_directory cannot exempt its calling directory")
  endif()
  set_property(DIRECTORY "${directory}"
    PROPERTY PROJECT_C_STANDARDS_EXTERNAL TRUE)
  set_property(DIRECTORY "${directory}"
    PROPERTY PROJECT_C_STANDARDS_EXTERNAL_REASON "${_reason}")
  message(STATUS "C standards external-directory exception: ${directory} (${_reason})")
endfunction()

function(project_assert_c_standards_applied)
  _project_assert_c_standards_in_directory("${CMAKE_CURRENT_SOURCE_DIR}")
endfunction()

function(project_apply_platform_profile target)
  if(PROJECT_PLATFORM_PROFILE STREQUAL "posix-2008")
    target_compile_definitions(${target} PRIVATE
      _POSIX_C_SOURCE=200809L
      _FILE_OFFSET_BITS=64
    )
  elseif(PROJECT_PLATFORM_PROFILE STREQUAL "win32")
    target_compile_definitions(${target} PRIVATE
      _WIN32_WINNT=${PROJECT_WIN32_WINNT}
      WINVER=${PROJECT_WIN32_WINNT}
    )
  endif()
endfunction()
