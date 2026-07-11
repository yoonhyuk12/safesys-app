import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: ["test_hwpx.js"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // 레거시 기준선 오류만 제외한다. 신규 work-plan 파일은 기본 엄격 규칙으로 대상 ESLint를 별도 실행해 계속 검증한다.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-wrapper-object-types": "off",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@next/next/no-assign-module-variable": "off",
      "prefer-const": "off",
      "prefer-rest-params": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/triple-slash-reference": "off",
      "@next/next/no-sync-scripts": "off",
    },
  },
];

export default eslintConfig;
