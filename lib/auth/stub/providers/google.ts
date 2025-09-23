import type { AuthProviderConfig } from '../index';

type GoogleProviderOptions = {
  clientId: string;
  clientSecret: string;
};

export default function GoogleProvider(options: GoogleProviderOptions): AuthProviderConfig {
  return {
    id: 'google',
    name: 'Google',
    type: 'oauth',
    clientId: options.clientId,
    clientSecret: options.clientSecret,
  };
}
