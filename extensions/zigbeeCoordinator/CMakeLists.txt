# ESP-IDF project boilerplate. PlatformIO's espidf framework regenerates the
# build tree, but CMake still needs these two lines in this exact order.
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)

project(zigbeeCoordinator)
