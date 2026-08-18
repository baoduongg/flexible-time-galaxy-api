import { Attendance } from '@prisma/client';

export function startOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// ponytail: HR chưa chốt mức phạt trễ chính thức — 15/60 phút là giá trị tạm, xem plan Open Questions.
const LATE_THRESHOLD_1_MINUTES = 15;
const LATE_THRESHOLD_2_MINUTES = 60;
const WORK_START_HOUR_UTC = 1; // 08:00 GMT+7

export type AttendanceStatusCode = 'X' | 'M1' | 'M2' | 'Ro' | 'P' | 'L';

export function deriveStatusCode(
  attendance: Pick<Attendance, 'checkinTime'> | undefined,
  onApprovedLeave: boolean,
  isHoliday = false,
): AttendanceStatusCode {
  if (isHoliday) {
    return 'L';
  }
  if (onApprovedLeave) {
    return 'P';
  }
  if (!attendance?.checkinTime) {
    return 'Ro';
  }

  const workStart = new Date(attendance.checkinTime);
  workStart.setUTCHours(WORK_START_HOUR_UTC, 0, 0, 0);
  const lateMinutes = Math.max(
    0,
    (attendance.checkinTime.getTime() - workStart.getTime()) / 60000,
  );

  if (lateMinutes > LATE_THRESHOLD_2_MINUTES) {
    return 'M2';
  }
  if (lateMinutes > LATE_THRESHOLD_1_MINUTES) {
    return 'M1';
  }
  return 'X';
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildAttendanceHistory(params: {
  year: number;
  month: number;
  attendances: Array<Pick<Attendance, 'date' | 'checkinTime'>>;
  approvedLeaveDates: Set<string>;
  feedbackByDate: Map<string, number>;
  holidayDates: Set<string>;
}): Array<{
  date: string;
  status_code: AttendanceStatusCode;
  has_feedback: boolean;
  feedback_request_id: number | null;
}> {
  const {
    year,
    month,
    attendances,
    approvedLeaveDates,
    feedbackByDate,
    holidayDates,
  } = params;
  const attendanceByDate = new Map(
    attendances.map((a) => [dateKey(a.date), a]),
  );
  const today = startOfToday();
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0));
  const end = lastDayOfMonth < today ? lastDayOfMonth : today;

  const result: Array<{
    date: string;
    status_code: AttendanceStatusCode;
    has_feedback: boolean;
    feedback_request_id: number | null;
  }> = [];

  for (
    const cursor = new Date(Date.UTC(year, month - 1, 1));
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const dayOfWeek = cursor.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    const key = dateKey(cursor);
    const statusCode = deriveStatusCode(
      attendanceByDate.get(key),
      approvedLeaveDates.has(key),
      holidayDates.has(key),
    );
    const feedbackRequestId = feedbackByDate.get(key) ?? null;

    result.push({
      date: key,
      status_code: statusCode,
      has_feedback: feedbackRequestId !== null,
      feedback_request_id: feedbackRequestId,
    });
  }

  return result;
}
