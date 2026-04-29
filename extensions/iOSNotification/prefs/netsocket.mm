#import <Preferences/Preferences.h>

@interface netsocketListController: PSListController {
}
- (void)showDebugLog;
- (void)clearDebugLog;
@end

@implementation netsocketListController
- (id)specifiers {
	if(_specifiers == nil) {
		_specifiers = [[self loadSpecifiersFromPlistName:@"netsocket" target:self] retain];
	}
	return _specifiers;
}

- (void)showDebugLog {
	NSString *logPath = @"/var/mobile/Library/Preferences/com.strayfade.netsocket.log";
	NSString *log = [NSString stringWithContentsOfFile:logPath encoding:NSUTF8StringEncoding error:nil];
	if (!log || log.length == 0) {
		log = @"No debug logs yet.";
	}

	UIViewController *logController = [[UIViewController alloc] init];
	logController.title = @"Debug Log";
	logController.view.backgroundColor = [UIColor systemBackgroundColor];

	UITextView *textView = [[UITextView alloc] initWithFrame:logController.view.bounds];
	textView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
	textView.editable = NO;
	textView.selectable = YES;
	textView.font = [UIFont monospacedSystemFontOfSize:12 weight:UIFontWeightRegular];
	textView.text = log;

	[logController.view addSubview:textView];
	[self.navigationController pushViewController:logController animated:YES];
}

- (void)clearDebugLog {
	NSString *logPath = @"/var/mobile/Library/Preferences/com.strayfade.netsocket.log";
	[[NSFileManager defaultManager] removeItemAtPath:logPath error:nil];

	UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"netsocket"
																   message:@"Debug log cleared."
															preferredStyle:UIAlertControllerStyleAlert];
	[alert addAction:[UIAlertAction actionWithTitle:@"OK" style:UIAlertActionStyleDefault handler:nil]];

	UIViewController *presentingController = self.navigationController ?: self;
	[presentingController presentViewController:alert animated:YES completion:nil];
}
@end

// vim:ft=objc