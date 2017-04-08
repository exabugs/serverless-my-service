const queue = require('./build_queue_jobs');

const event = {};
const context = {
  fail : () => {
    process.exit(-1);
  },
  succeed: () => {
    process.exit(0);
  }
};

queue.handler(event, context);