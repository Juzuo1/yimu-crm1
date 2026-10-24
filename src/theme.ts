import { theme as antdTheme } from 'antd';

// YIMU 品牌主题：浅色为主 + 深蓝/橙点缀
export const BRAND = {
  navy: '#0A2540',      // 深蓝主色（导航/标题）
  orange: '#FF6B35',    // 橙色点缀（关键操作）
  bg: '#F5F7FA',        // 页面底色
  cardBg: '#FFFFFF',
};

export const theme = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: BRAND.orange,
    colorInfo: BRAND.navy,
    colorBgLayout: BRAND.bg,
    borderRadius: 8,
    fontSize: 14,
  },
  components: {
    Layout: {
      siderBg: BRAND.navy,
      headerBg: '#FFFFFF',
    },
    Menu: {
      darkItemBg: BRAND.navy,
      darkSubMenuItemBg: '#0E2F52',
      darkItemSelectedBg: BRAND.orange,
      darkItemHoverBg: '#12355F',
    },
    Table: {
      headerBg: '#F0F3F8',
      headerColor: BRAND.navy,
      rowHoverBg: '#FFF4ED',
    },
    Card: {
      boxShadow: '0 1px 3px rgba(10, 37, 64, 0.08)',
    },
  },
};
