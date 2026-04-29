import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*']
  },
  {
    plugins: {
      firebaseRules: firebaseRulesPlugin
    }
  }
];
