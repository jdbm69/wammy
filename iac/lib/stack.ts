// Declaracion de Stack principal, de una Lambda y de API Gateway HTTP 

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { join } from 'path';

// Stack de CDK
export class WamyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // AWS LAmbda
    const fn = new NodejsFunction(this, 'AggregatorFn', {
      entry: join(__dirname, '..', '..', 'src', 'handler.ts'),
      handler: 'main',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(100),
      bundling: {
        target: 'node18',
        externalModules: [],
      },
      // Variables de entorno dentro de Lambda
      environment: {
        VISION_PROVIDER: process.env.VISION_PROVIDER || '',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
      }
    });

    // Creacion de HTTP API 
    const api = new apigwv2.HttpApi(this, 'Api', {
      apiName: 'wamy-wind-aggregator'
    });

    // Agregar una ruta a la API
    api.addRoutes({
      path: '/aggregate', // Path
      methods: [HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('AggIntegration', fn),
    });

    // Output con la URL base 
    new cdk.CfnOutput(this, 'ApiBaseUrl', { value: api.apiEndpoint });
  }
}
