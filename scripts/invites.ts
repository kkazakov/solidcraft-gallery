import { createDatabase, createInvite, findUserByUsername, listInvites, revokeInvite } from '@gallery/db';

function usage(): never {
  console.error(`Usage:
  pnpm invites create --by <admin> [--note text] [--uses N] [--days N]
  pnpm invites list
  pnpm invites revoke <invite-id>`);
  process.exit(1);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
const db = createDatabase(databaseUrl, { max: 2 });

try {
  if (command === 'create') {
    const by = option(args, '--by');
    if (!by) usage();
    const admin = await findUserByUsername(db, by);
    if (!admin || admin.role !== 'admin') {
      console.error(`No admin user named ${by}. Set ADMIN_USERNAMES and sign in once first.`);
      process.exitCode = 1;
    } else {
      const uses = Number.parseInt(option(args, '--uses') ?? '1', 10);
      const days = Number.parseInt(option(args, '--days') ?? '14', 10);
      const invite = await createInvite(db, {
        createdBy: admin.id,
        note: option(args, '--note') ?? '',
        maxUses: Number.isFinite(uses) ? uses : 1,
        expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000) : null,
      });
      console.log(`invite ${invite.id}`);
      console.log(`code   ${invite.code}`);
      console.log('The code is shown once; store it before closing this terminal.');
    }
  } else if (command === 'list') {
    const invites = await listInvites(db);
    if (invites.length === 0) console.log('No invites.');
    for (const invite of invites) {
      const state = invite.revokedAt
        ? 'revoked'
        : invite.expiresAt && invite.expiresAt < new Date()
          ? 'expired'
          : 'active';
      console.log(
        `${invite.id}  ${state.padEnd(8)} ${invite.uses}/${invite.maxUses}  by ${invite.createdBy}  ${invite.note}`,
      );
    }
  } else if (command === 'revoke') {
    const id = args[0];
    if (!id) usage();
    const revoked = await revokeInvite(db, id);
    console.log(revoked ? `revoked ${id}` : `no active invite ${id}`);
  } else {
    usage();
  }
} finally {
  await db.end({ timeout: 5 });
}
