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
const mongoose = require('mongoose');
const User = require('./models/User'); // ปรับเส้นทางตามที่ตั้งของโมเดล User
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

require('dotenv').config({path: './config.env'});

const server = new grpc.Server();

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Could not connect to MongoDB', err));

server.addService(authProto.AuthService.service, {
  Register: async (call, callback) => {
    // การจัดการสำหรับ Register
    const { email, password } = call.request;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();
    callback(null, { message: 'User registered' });
  },
  Login: async (call, callback) => {
    // การจัดการสำหรับ Login
    const { email, password } = call.request;
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      callback(null, { token });
    } else {
      callback({
        code: grpc.status.INVALID_ARGUMENT,
        details: 'Invalid credentials'
      });
    }
  },
  GetUser: async (call, callback) => {
    try {
      const token = call.request.token;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        callback(null, {
          email: user.email,
          name: user.name || '',
          surname: user.surname || '',
          displayName: user.displayName || '',
          tel: user.tel || ''
        });
      } else {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'User not found'
        });
      }
    } catch (error) {
      callback({
        code: grpc.status.UNAUTHENTICATED,
        details: 'Invalid token'
      });
    }
  },
  UpdateUser: async (call, callback) => {
    try {
      const { token, name, surname, displayName, tel } = call.request;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        if (name) user.name = name;
        if (surname) user.surname = surname;
        if (displayName) user.displayName = displayName;
        if (tel) user.tel = tel;
        await user.save();
        callback(null, { message: 'User profile updated' });
      } else {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'User not found'
        });
      }
    } catch (error) {
      callback({
        code: grpc.status.UNAUTHENTICATED,
        details: 'Invalid token'
      });
    }
  },
  DeleteUser: async (call, callback) => {
    try {
      const { token } = call.request;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByIdAndDelete(decoded.id);
      if (user) {
        callback(null, { message: 'User deleted' });
      } else {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'User not found'
        });
      }
    } catch (error) {
      callback({
        code: grpc.status.UNAUTHENTICATED,
        details: 'Invalid token'
      });
    }
  }
});

const serverAddress = process.env.server_address || '127.0.0.1:50051';

server.bindAsync(serverAddress, grpc.ServerCredentials.createInsecure(), (error, port) => {
  if (error) {
    console.error('Failed to bind server:', error);
    return;
  }
  console.log(`Server running at ${serverAddress}`);
});