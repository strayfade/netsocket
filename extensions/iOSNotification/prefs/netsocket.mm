#import <Preferences/Preferences.h>

@interface netsocketListController: PSListController {
}
@end

@implementation netsocketListController
- (id)specifiers {
	if(_specifiers == nil) {
		_specifiers = [[self loadSpecifiersFromPlistName:@"netsocket" target:self] retain];
	}
	return _specifiers;
}
@end

// vim:ft=objc