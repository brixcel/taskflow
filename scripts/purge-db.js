const prisma = require('../prisma');

async function main() {
  console.log('Purging database...');
  const comments = await prisma.comment.deleteMany({});
  console.log(`Deleted ${comments.count} comments.`);
  
  const activities = await prisma.activity.deleteMany({});
  console.log(`Deleted ${activities.count} activities.`);
  
  const tasks = await prisma.task.deleteMany({});
  console.log(`Deleted ${tasks.count} tasks.`);
  
  const memberships = await prisma.teamMembership.deleteMany({});
  console.log(`Deleted ${memberships.count} team memberships.`);
  
  const teams = await prisma.team.deleteMany({});
  console.log(`Deleted ${teams.count} teams.`);
  
  const resetTokens = await prisma.passwordResetToken.deleteMany({});
  console.log(`Deleted ${resetTokens.count} password reset tokens.`);
  
  const users = await prisma.user.deleteMany({});
  console.log(`Deleted ${users.count} users.`);
  
  console.log('Database purge complete!');
}

main()
  .catch((e) => {
    console.error('Error purging database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
