const nxPlugin = require('@nx/eslint-plugin');

module.exports = [
  {
    plugins: {
      '@nx': nxPlugin,
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:model',
                'type:contract',
                'type:sdk',
                'type:service',
                'type:infrastructure',
                'type:connector'
              ]
            },
            {
              sourceTag: 'type:connector',
              onlyDependOnLibsWithTags: [
                'type:model',
                'type:contract',
                'type:sdk',
                'type:infrastructure'
              ]
            },
            {
              sourceTag: 'type:model',
              onlyDependOnLibsWithTags: ['type:model']
            }
          ]
        }
      ]
    }
  }
];
