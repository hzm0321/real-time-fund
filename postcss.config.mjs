import pxtorem from "postcss-pxtorem";

export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
    "postcss-pxtorem": pxtorem({
      rootValue: 16, // 与 PC 端 html font-size 一致（1rem = 16px，转换后视觉无差异）
      propList: ["*"], // 转换所有 CSS 属性中的 px
      mediaQuery: false, // 不转换 @media 块内的 px（移动端 media query 内保留 px）
      minPixelValue: 2, // 保留 1px 边框不转（避免 sub-pixel 渲染导致边框消失）
      unitPrecision: 5, // rem 精度 5 位小数
    }),
  },
};
