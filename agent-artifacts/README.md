# Agent artifacts

Project handoff documentation for **Still**, the private voice-first diary intended for your configured production domain.

| Document                      | Contents                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| [Stack](STACK.md)             | Technologies, responsibilities, and replacement boundaries           |
| [Working](WORKING.md)         | Recording, processing, persistence, security, and recovery           |
| [Deployment](DEPLOYMENT.md)   | Environment setup, services, migrations, and Vercel deployment       |
| [Status](STATUS.md)           | Implemented features, verified checks, pending work, and limitations |
| [Development](DEVELOPMENT.md) | Local commands, linting, tests, and maintenance conventions          |

These files describe the checked-in implementation. They do not prove that external services are configured or that the production domain is deployed. Keep this folder updated when behavior, infrastructure, or validation results change. Never put credentials, diary content, or private recording samples here.

## Ecosystem launcher

Cross-app architecture and integration instructions: [AJ launcher documentation](../../aj-app-launcher/agent-artifacts/README.md) (local workspace; remote repository creation pending). Local canonical source is the sibling aj-app-launcher/agent-artifacts directory. The public menu grants no application access.
