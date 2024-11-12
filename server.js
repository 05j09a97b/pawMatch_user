const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { PrismaClient } = require('./prisma/generated/client1');
const authService = require('./service/auth');
require('dotenv').config({ path: './.env'});

const prisma = new PrismaClient();

// Print environment variables for debugging
console.log('Supabase URL:', process.env.SUPABASE_URL);
console.log('Supabase Anon Key (first 5 chars):', process.env.SUPABASE_ANON_KEY.substring(0, 5));
console.log('Bucket Name:', 'profile-image');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT);

// Load protobuf
const PROTO_PATH = path.resolve(__dirname, './service/auth.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

// Create gRPC server
const server = new grpc.Server();

// Load the protobuf
const proto = grpc.loadPackageDefinition(packageDefinition);

// Add the service implementation
server.addService(proto.auth.AuthService.service, {
  register: authService.Register,
  login: authService.Login,
  getProfile: authService.GetProfile,
  updateProfile: authService.UpdateProfile,
  changePassword: authService.ChangePassword,
  deleteProfile: authService.DeleteProfile,
  logout: authService.Logout
});

// Start server
const host = '0.0.0.0';
const port = process.env.PORT || 50051;

server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), async (err, port) => {
  if (err) {
    console.error('Failed to bind server:', err);
    return;
  }

  try {
    await prisma.$connect();
    console.log('Connected to database');
    
    server.start();
    console.log(`gRPC server running on ${host}:${port}`);
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing gRPC server');
  server.tryShutdown(async (error) => {
    if (error) {
      console.error('Error shutting down gRPC server:', error);
    } else {
      console.log('gRPC server closed');
    }
    await prisma.$disconnect();
    process.exit(0);
  });
});

module.exports = server;