const fs = require('node:fs');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Docker copies the proto next to the gateway; local development reads it from the evidence service.
const PROTO_CANDIDATES = [
  process.env.PROTO_PATH,
  path.resolve(__dirname, '../proto/evidence_argument.proto'),
  path.resolve(__dirname, '../../EvidenceAndArgumentSubmission/proto/evidence_argument.proto')
].filter(Boolean);
const protoPath = PROTO_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!protoPath) throw new Error('evidence_argument.proto was not found; set PROTO_PATH.');

const definition = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const api = grpc.loadPackageDefinition(definition).humanresolve.argument.v1;

const address = `${process.env.GRPC_HOST || '127.0.0.1'}:${process.env.GRPC_PORT || '50051'}`;
const credentials = grpc.credentials.createInsecure();
const clients = {
  argument: new api.ArgumentService(address, credentials),
  authentication: new api.AuthenticationService(address, credentials)
};

function call(service, method, request, accessToken) {
  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    if (accessToken) metadata.set('authorization', `Bearer ${accessToken}`);
    clients[service][method](request, metadata, { deadline: new Date(Date.now() + 8000) }, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

const HTTP_STATUS = {
  [grpc.status.INVALID_ARGUMENT]: 400,
  [grpc.status.UNAUTHENTICATED]: 401,
  [grpc.status.PERMISSION_DENIED]: 403,
  [grpc.status.NOT_FOUND]: 404,
  [grpc.status.ALREADY_EXISTS]: 409,
  [grpc.status.ABORTED]: 409,
  [grpc.status.FAILED_PRECONDITION]: 412,
  [grpc.status.UNAVAILABLE]: 503,
  [grpc.status.DEADLINE_EXCEEDED]: 504
};

function toHttpError(error) {
  const status = HTTP_STATUS[error.code] || 500;
  return { status, body: { error: error.details || error.message, grpc_code: grpc.status[error.code] || 'UNKNOWN' } };
}

module.exports = { call, toHttpError, address };
