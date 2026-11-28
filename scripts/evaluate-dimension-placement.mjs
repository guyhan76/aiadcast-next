// Paid evaluation moved to the existing authenticated cloud server.
// A separate local ledger could duplicate the single user-approved budget.
// Keep this old entry closed; never move or ask for the production key here.
console.error('SERVER_EVALUATION_ONLY: use the authenticated server with its shared PostgreSQL approval ledger.');
process.exitCode = 1;
