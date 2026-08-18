import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AttendanceController } from './attendance.controller';

describe('AttendanceController', () => {
  // checkin/checkout are state-transition actions, not resource creation, so the
  // spec (and ResponseEnvelopeInterceptor's "success" vs "created" status) expects
  // 200 OK rather than Nest's default 201 for @Post handlers.
  it.each(['checkin', 'checkout'] as const)(
    '%s responds with 200 OK, not the default 201',
    (method) => {
      const httpCode = Reflect.getMetadata(
        HTTP_CODE_METADATA,
        AttendanceController.prototype[method],
      );
      expect(httpCode).toBe(HttpStatus.OK);
    },
  );

  it('is mounted under app/attendance', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      AttendanceController,
    ) as string;
    expect(path).toBe('app/attendance');
  });
});
