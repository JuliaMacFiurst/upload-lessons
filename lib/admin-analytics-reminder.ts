export const TESTING_REMINDER_VISITOR_THRESHOLD = 15;
export const TESTING_REMINDER_START_HOUR = 9;

export const TESTING_REMINDER_TEXT = `Dear testers! 💛

My analytics show that LapLapLa has had fewer active visitors than usual today, so I’d be very grateful if everyone who hasn’t opened the app yet could spare just a couple of minutes to visit it and try a few things.

Every visit during the closed testing period really helps me make sure the app is being properly tested before release. Thank you so much for taking part and for giving me a little bit of your time. I truly appreciate it! 🙏

And for everyone participating with me through T4T: I’ll be visiting and testing your apps today as well. 🤝

Thank you again for helping LapLapLa get through these final days of closed testing! 🐾`;

export type TestingReminderState = "before-reminder-time" | "reminder-needed" | "activity-good";

export function getTestingReminderState(todayVisitors: number, localHour: number): TestingReminderState {
  if (todayVisitors >= TESTING_REMINDER_VISITOR_THRESHOLD) {
    return "activity-good";
  }
  return localHour >= TESTING_REMINDER_START_HOUR ? "reminder-needed" : "before-reminder-time";
}
