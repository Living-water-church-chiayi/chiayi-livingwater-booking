import type { BookingType, RepeatType } from './types';

export const PINNED_TOP_VENUES = ['2F主堂', '飛鷹堂'] as const;

// Default order reflects real Firestore booking popularity, with 2F主堂 (#1) and 飛鷹堂 (#2) always pinned first
export const VENUES = [
  '2F主堂',
  '飛鷹堂',
  '副堂',
  '馬可餐廳',
  '4F',
  '3F大空間',
  '3F幼幼班',
  '3F會議室',
  '方舟小棧',
  '豐盛教室',
  '地下室',
] as const;

export const CHURCH_WIDE_VENUE = '全教會';

// Warm sanctuary-harmonized venue color palette (high contrast, distinct, zero harsh neon)
export interface VenueStyle {
  card: string;
  pillActive: string;
  dot: string;
  chip: string;
  bar: string;
}

export const VENUE_STYLES: Record<string, VenueStyle> = {
  '2F主堂': {
    card: 'bg-[#FFF7EE] border-[#F0D4B2] text-[#8E4716] hover:bg-[#FDEEE0] hover:border-[#E3BC8B]',
    pillActive: 'bg-[#FFF3E3] text-[#8E4716] border-[#E7C294]',
    dot: 'bg-[#C86D2D]',
    chip: 'bg-[#FDF0DF] text-[#8E4716]',
    bar: 'bg-[#C86D2D]',
  },
  '飛鷹堂': {
    card: 'bg-[#F4F6F0] border-[#CDD9BD] text-[#3F5726] hover:bg-[#EAF0E2] hover:border-[#B3C79B]',
    pillActive: 'bg-[#EDF3E6] text-[#3F5726] border-[#BDD0A6]',
    dot: 'bg-[#5E7E3A]',
    chip: 'bg-[#E9F0E1] text-[#3F5726]',
    bar: 'bg-[#5E7E3A]',
  },
  '馬可餐廳': {
    card: 'bg-[#EEF7F3] border-[#BFE0D2] text-[#1F5E48] hover:bg-[#E2F2EB] hover:border-[#9ECDB9]',
    pillActive: 'bg-[#E7F5EE] text-[#1F5E48] border-[#ADD5C4]',
    dot: 'bg-[#2B7A62]',
    chip: 'bg-[#E3F3EB] text-[#1F5E48]',
    bar: 'bg-[#2B7A62]',
  },
  '方舟小棧': {
    card: 'bg-[#FEF9EA] border-[#EED99C] text-[#7D5A10] hover:bg-[#FCF3D6] hover:border-[#E3C46E]',
    pillActive: 'bg-[#FDF4D9] text-[#7D5A10] border-[#E5C978]',
    dot: 'bg-[#C9921D]',
    chip: 'bg-[#FBF1D2] text-[#7D5A10]',
    bar: 'bg-[#C9921D]',
  },
  '豐盛教室': {
    card: 'bg-[#FBF2F5] border-[#E9C5D1] text-[#873452] hover:bg-[#F7E6EC] hover:border-[#DBA6B8]',
    pillActive: 'bg-[#F8E9EE] text-[#873452] border-[#E0B3C2]',
    dot: 'bg-[#B34B6F]',
    chip: 'bg-[#F6E5EB] text-[#873452]',
    bar: 'bg-[#B34B6F]',
  },
  '副堂': {
    card: 'bg-[#EEF6F8] border-[#BCD8E0] text-[#1F5869] hover:bg-[#E1EFF3] hover:border-[#9AC4D0]',
    pillActive: 'bg-[#E6F2F5] text-[#1F5869] border-[#A9CED9]',
    dot: 'bg-[#2D788D]',
    chip: 'bg-[#E2EFF3] text-[#1F5869]',
    bar: 'bg-[#2D788D]',
  },
  '3F幼幼班': {
    card: 'bg-[#FDF3F0] border-[#F0C8BC] text-[#943B27] hover:bg-[#FBE7E1] hover:border-[#E4AE9E]',
    pillActive: 'bg-[#FCECE7] text-[#943B27] border-[#E8B8AA]',
    dot: 'bg-[#C75A40]',
    chip: 'bg-[#FAE8E2] text-[#943B27]',
    bar: 'bg-[#C75A40]',
  },
  '3F會議室': {
    card: 'bg-[#EFF6F5] border-[#C1DDD8] text-[#1F5C55] hover:bg-[#E2EFECEB] hover:border-[#9ECAC2]',
    pillActive: 'bg-[#E7F3F1] text-[#1F5C55] border-[#AED3CC]',
    dot: 'bg-[#2E7E74]',
    chip: 'bg-[#E2F0EE] text-[#1F5C55]',
    bar: 'bg-[#2E7E74]',
  },
  '3F大空間': {
    card: 'bg-[#F7F3EF] border-[#DCCBB8] text-[#6A4A2D] hover:bg-[#EFE8E0] hover:border-[#C9B299]',
    pillActive: 'bg-[#F1EAE2] text-[#6A4A2D] border-[#D0BBA4]',
    dot: 'bg-[#8E6542]',
    chip: 'bg-[#EDE5DC] text-[#6A4A2D]',
    bar: 'bg-[#8E6542]',
  },
  '4F': {
    card: 'bg-[#FFF5EC] border-[#F2CFAF] text-[#9B4D18] hover:bg-[#FDEBD9] hover:border-[#E7B68A]',
    pillActive: 'bg-[#FEEFE1] text-[#9B4D18] border-[#EBC09A]',
    dot: 'bg-[#D67229]',
    chip: 'bg-[#FDECE0] text-[#9B4D18]',
    bar: 'bg-[#D67229]',
  },
  '地下室': {
    card: 'bg-[#F3F2EF] border-[#D5D1C8] text-[#4C4740] hover:bg-[#EAE8E2] hover:border-[#BFB9AC]',
    pillActive: 'bg-[#ECEAE4] text-[#4C4740] border-[#C9C3B8]',
    dot: 'bg-[#6F685E]',
    chip: 'bg-[#E9E6DF] text-[#4C4740]',
    bar: 'bg-[#6F685E]',
  },
};

export const DEFAULT_VENUE_STYLE: VenueStyle = {
  card: 'bg-[#F5F3EF] border-[#DED8CE] text-[#4B453E] hover:bg-[#ECE8E0]',
  pillActive: 'bg-[#EFECE6] text-[#4B453E] border-[#D4CDC2]',
  dot: 'bg-[#7A7268]',
  chip: 'bg-[#EDEAE4] text-[#4B453E]',
  bar: 'bg-[#7A7268]',
};

export const CHURCH_WIDE_STYLE: VenueStyle = {
  card: 'bg-[#FDF1F1] border-[#EFC2C2] text-[#9A2B2B] hover:bg-[#FBE4E4] hover:border-[#E4A5A5]',
  pillActive: 'bg-[#FCE9E9] text-[#9A2B2B] border-[#E8B2B2]',
  dot: 'bg-[#C43E3E]',
  chip: 'bg-[#FCE6E6] text-[#9A2B2B]',
  bar: 'bg-[#C43E3E]',
};

// Real-world church booking purposes collected from 872 actual bookings + curated defaults
export const PURPOSE_PRESETS = [
  '小組聚會',
  '青年崇拜',
  '區組聚會',
  '敬拜團練習',
  '運動課',
  '鋼琴課',
  '幸福手作班',
  '開會',
  '兒童營會',
  '手鐘團練習',
  '戲劇排練',
  '拍影片',
  '執事會',
  '特別聚會',
  '個人安靜',
  '場地維護',
];

export const CHURCH_WIDE_PURPOSE_PRESETS = [
  '主日崇拜',
  '神蹟禱告會',
  '愛家禱告會',
  '教會消毒',
  '特別聚會',
  '聯合聚會',
];

export const RECENT_BORROWERS_KEY = 'chiayi-livingwater-recent-borrowers-v1';

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  standard: '一般場地借用',
  'sunday-service': '全教會聚會時段',
  'special-service': '特別聚會（舊）',
};

export const CHURCH_WIDE_TYPE_BADGES: Record<Exclude<BookingType, 'standard'>, string> = {
  'sunday-service': '全教會聚會時段',
  'special-service': '特別聚會（舊）',
};

export const CHURCH_WIDE_TYPE_DEFAULT_PURPOSE: Record<BookingType, string> = {
  standard: '',
  'sunday-service': '主日崇拜',
  'special-service': '特別聚會',
};

export const REPEAT_LABELS: Record<RepeatType, string> = {
  none: '不重複',
  daily: '每天',
  weekly: '每週',
  biweekly: '每兩週',
  'odd-weeks': '單數週',
  'even-weeks': '雙數週',
};

export const MONTH_NAMES = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
];

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const ADMIN_PASSWORD = '04852591';
export const ADMIN_SESSION_KEY = 'venue-admin-authenticated';
export const BOOKINGS_CACHE_KEY = 'chiayi-livingwater-bookings-cache-v2';

export const MIN_BOOKING_TIME = '05:00';
export const MAX_BOOKING_TIME = '22:00';
export const LATEST_START_TIME = '21:00';
export const MAX_REPEAT_MONTHS = 3;
