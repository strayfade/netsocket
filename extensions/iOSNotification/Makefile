TARGET := iphone:clang:16.5:16.0
INSTALL_TARGET_PROCESSES = SpringBoard
ARCHS = arm64 arm64e

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = netsocket

netsocket_FILES = Tweak.xm
netsocket_CFLAGS = -fobjc-arc -w
netsocket_FRAMEWORKS = CydiaSubstrate SpringBoard

include $(THEOS_MAKE_PATH)/tweak.mk
SUBPROJECTS += prefs
include $(THEOS_MAKE_PATH)/aggregate.mk
