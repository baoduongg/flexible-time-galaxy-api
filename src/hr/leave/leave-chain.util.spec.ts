import { BadRequestException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { resolveApprovalChain } from './leave-chain.util';

describe('resolveApprovalChain', () => {
  describe('requester is MEMBER', () => {
    const base = {
      id: 1,
      orgRole: OrgRole.MEMBER,
      leaderId: 10,
      managerId: 20,
      directorId: 30,
    };

    it('≤2 ngày: only LEADER', () => {
      expect(resolveApprovalChain(base, 2)).toEqual([
        { level: OrgRole.LEADER, approverId: 10 },
      ]);
    });

    it('3-5 ngày: LEADER then MANAGER', () => {
      expect(resolveApprovalChain(base, 5)).toEqual([
        { level: OrgRole.LEADER, approverId: 10 },
        { level: OrgRole.MANAGER, approverId: 20 },
      ]);
    });

    it('>5 ngày: LEADER, MANAGER, DIRECTOR', () => {
      expect(resolveApprovalChain(base, 6)).toEqual([
        { level: OrgRole.LEADER, approverId: 10 },
        { level: OrgRole.MANAGER, approverId: 20 },
        { level: OrgRole.DIRECTOR, approverId: 30 },
      ]);
    });

    it('throws when the member has no team leader assigned', () => {
      expect(() =>
        resolveApprovalChain({ ...base, leaderId: null }, 2),
      ).toThrow(BadRequestException);
    });
  });

  describe('requester is LEADER', () => {
    const base = {
      id: 10,
      orgRole: OrgRole.LEADER,
      leaderId: null,
      managerId: 20,
      directorId: 30,
    };

    it('≤5 ngày: starts at MANAGER (skips self as LEADER)', () => {
      expect(resolveApprovalChain(base, 4)).toEqual([
        { level: OrgRole.MANAGER, approverId: 20 },
      ]);
    });

    it('>5 ngày: MANAGER then DIRECTOR', () => {
      expect(resolveApprovalChain(base, 6)).toEqual([
        { level: OrgRole.MANAGER, approverId: 20 },
        { level: OrgRole.DIRECTOR, approverId: 30 },
      ]);
    });
  });

  describe('requester is MANAGER', () => {
    it('always escalates straight to DIRECTOR regardless of duration', () => {
      const context = {
        id: 20,
        orgRole: OrgRole.MANAGER,
        leaderId: null,
        managerId: null,
        directorId: 30,
      };
      expect(resolveApprovalChain(context, 1)).toEqual([
        { level: OrgRole.DIRECTOR, approverId: 30 },
      ]);
      expect(resolveApprovalChain(context, 10)).toEqual([
        { level: OrgRole.DIRECTOR, approverId: 30 },
      ]);
    });

    it('throws when no DIRECTOR exists in the company', () => {
      const context = {
        id: 20,
        orgRole: OrgRole.MANAGER,
        leaderId: null,
        managerId: null,
        directorId: null,
      };
      expect(() => resolveApprovalChain(context, 1)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('requester is DIRECTOR', () => {
    it('produces a single step with approverId null (ADMIN must decide)', () => {
      const context = {
        id: 30,
        orgRole: OrgRole.DIRECTOR,
        leaderId: null,
        managerId: null,
        directorId: 30,
      };
      expect(resolveApprovalChain(context, 3)).toEqual([
        { level: OrgRole.DIRECTOR, approverId: null },
      ]);
    });
  });
});
