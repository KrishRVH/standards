cmake_minimum_required(VERSION 3.20)
project(c_project_consumer LANGUAGES C)

find_package(c_project CONFIG REQUIRED)

function(add_consumer target dependency)
  add_executable(${target} main.c)
  set_target_properties(${target} PROPERTIES
    C_STANDARD 99
    C_STANDARD_REQUIRED YES
    C_EXTENSIONS NO
  )
  target_link_libraries(${target} PRIVATE ${dependency})
endfunction()

add_consumer(consumer_static c_project::library)
add_consumer(consumer_shared c_project::library_shared)
