#!/usr/bin/env node

// Entrypoint de la app CDK, carga variables de entorno, crea la App y despliega la instancia de WamyStack

import * as path from 'path';
import * as dotenv from 'dotenv';

import * as cdk from 'aws-cdk-lib';   
import { WamyStack } from '../lib/stack'; 

dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = new cdk.App();
new WamyStack(app, 'WamyWindAggregatorStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});