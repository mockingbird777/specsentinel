import type { RuleDefinition } from './types.js';

export const rules: Record<string, RuleDefinition> = {
  'PATH_REMOVED': {
    id: 'PATH_REMOVED', title: 'Path removed', defaultSeverity: 'critical',
    description: 'An API path available in the baseline is absent from the candidate.'
  },
  'OPERATION_REMOVED': {
    id: 'OPERATION_REMOVED', title: 'Operation removed', defaultSeverity: 'critical',
    description: 'An HTTP operation available in the baseline is absent from the candidate.'
  },
  'PARAM_REQUIRED_ADDED': {
    id: 'PARAM_REQUIRED_ADDED', title: 'Required parameter added', defaultSeverity: 'high',
    description: 'A new parameter is required, or an existing optional parameter became required.'
  },
  'PARAM_TYPE_CHANGED': {
    id: 'PARAM_TYPE_CHANGED', title: 'Parameter type changed', defaultSeverity: 'high',
    description: 'The declared type of an existing parameter changed.'
  },
  'PARAM_ENUM_NARROWED': {
    id: 'PARAM_ENUM_NARROWED', title: 'Parameter enum narrowed', defaultSeverity: 'high',
    description: 'Values previously accepted by a parameter are no longer accepted.'
  },
  'REQUEST_BODY_REQUIRED': {
    id: 'REQUEST_BODY_REQUIRED', title: 'Request body became required', defaultSeverity: 'high',
    description: 'An optional or absent request body is now required.'
  },
  'REQUEST_CONTENT_REMOVED': {
    id: 'REQUEST_CONTENT_REMOVED', title: 'Request content removed', defaultSeverity: 'high',
    description: 'A request media type accepted by the baseline is no longer accepted.'
  },
  'REQUEST_PROPERTY_REQUIRED': {
    id: 'REQUEST_PROPERTY_REQUIRED', title: 'Request property became required', defaultSeverity: 'high',
    description: 'A request schema property is newly required.'
  },
  'REQUEST_TYPE_CHANGED': {
    id: 'REQUEST_TYPE_CHANGED', title: 'Request schema type changed', defaultSeverity: 'high',
    description: 'A request schema type changed and may reject existing clients.'
  },
  'RESPONSE_REMOVED': {
    id: 'RESPONSE_REMOVED', title: 'Response removed', defaultSeverity: 'high',
    description: 'A documented response status is no longer present.'
  },
  'RESPONSE_CONTENT_REMOVED': {
    id: 'RESPONSE_CONTENT_REMOVED', title: 'Response content removed', defaultSeverity: 'high',
    description: 'A response media type or schema is no longer present.'
  },
  'RESPONSE_PROPERTY_REMOVED': {
    id: 'RESPONSE_PROPERTY_REMOVED', title: 'Response property removed', defaultSeverity: 'high',
    description: 'A property clients may consume was removed from a response schema.'
  },
  'RESPONSE_TYPE_CHANGED': {
    id: 'RESPONSE_TYPE_CHANGED', title: 'Response schema type changed', defaultSeverity: 'high',
    description: 'A response schema type changed and may break client deserialization.'
  },
  'SECURITY_STRENGTHENED': {
    id: 'SECURITY_STRENGTHENED', title: 'Security requirement strengthened', defaultSeverity: 'high',
    description: 'Previously valid anonymous or authenticated requests require stronger credentials or scopes.'
  }
};

export const ruleList = Object.values(rules);
