const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const PROTO_PATH = __dirname + '/auth.proto';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const authProto = grpc.loadPackageDefinition(packageDefinition).auth;
const client = new authProto.AuthService('127.0.0.1:50051', grpc.credentials.createInsecure());

function register(email, password) {
  return new Promise((resolve, reject) => {
    client.Register({ email, password }, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function login(email, password) {
  return new Promise((resolve, reject) => {
    client.Login({ email, password }, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function getUser(token) {
  return new Promise((resolve, reject) => {
    client.GetUser({ token }, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

async function runSingleTest(email, password) {
  try {
    console.log(`\nTesting with email: ${email}`);
    console.log('Registering user...');
    await register(email, password);
    console.log('User registered successfully');

    console.log('Logging in...');
    const loginResponse = await login(email, password);
    console.log('Login successful, token:', loginResponse.token);

    console.log('Getting user profile...');
    const userProfile = await getUser(loginResponse.token);
    console.log('User profile:', userProfile);

    console.log('Test passed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
  }
}

async function runMultipleTests() {
  const testData = [
    { email: 'test1@example.com', password: 'password123' },
    { email: 'test2@example.com', password: 'securepass456' },
    { email: 'test3@example.com', password: 'strongpass789' }
  ];

  for (let i = 0; i < testData.length; i++) {
    console.log(`\n--- Running test ${i + 1} ---`);
    await runSingleTest(testData[i].email, testData[i].password);
  }

  console.log('\nAll tests completed.');
}

runMultipleTests();