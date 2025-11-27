// Test to understand stack format

function testStackFormat() {
  const error = new Error();
  const stack = error.stack || '';
  const lines = stack.split('\n');
  
  console.log('=== Full Stack ===');
  console.log(stack);
  console.log('\n=== Stack Lines ===');
  lines.forEach((line, i) => {
    console.log(`[${i}]: ${line}`);
  });
  
  console.log('\n=== Testing Regex Patterns ===');
  lines.forEach((line, i) => {
    const match1 = line.match(/\((.+?):(\d+):(\d+)\)/);
    const match2 = line.match(/at (.+):(\d+):(\d+)/);
    if (match1) console.log(`[${i}] Pattern 1 matched: file=${match1[1]}, line=${match1[2]}, col=${match1[3]}`);
    if (match2) console.log(`[${i}] Pattern 2 matched: file=${match2[1]}, line=${match2[2]}, col=${match2[3]}`);
  });
}

// Call it
testStackFormat();
