"use client";

import { useState } from "react";

import { Popover } from "@base-ui/react/popover";

import { CheckIcon, ChevronIcon } from "./icons";
import { inputClass } from "./input-class";
import { menuItemClass } from "./menu-item";

function cityOf(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

export function tzDisplayLabel(iana: string): string {
  return ALL_TZ_MAP.get(iana)?.name ?? cityOf(iana);
}

export function useTzLabel(): (iana: string) => string {
  return (iana: string) => ALL_TZ_MAP.get(iana)?.name ?? cityOf(iana);
}

// 収録方針・命名ルール・並び順は docs/ui-guidelines.md「タイムゾーンピッカーの命名ルール」参照。
// 3段構成: 大陸グループ → UN サブ地域 → 国/ゾーン
// 並び順: サブ地域内は UTC オフセット昇順、同値は五十音順
const TZ_GROUPS: Array<{
  label: string;
  subGroups: Array<{
    label: string;
    zones: Array<{ iana: string; name: string; sub?: string }>;
  }>;
}> = [
  {
    label: "アジア",
    subGroups: [
      {
        label: "西アジア",
        zones: [
          { iana: "Asia/Nicosia",    name: "キプロス" },            // UTC+2
          { iana: "Asia/Gaza",       name: "パレスチナ" },          // UTC+2 (Gaza+Hebron 統合)
          { iana: "Asia/Jerusalem",  name: "イスラエル" },          // UTC+2
          { iana: "Asia/Beirut",     name: "レバノン" },            // UTC+2
          { iana: "Asia/Amman",      name: "ヨルダン" },            // UTC+3
          { iana: "Asia/Baghdad",    name: "イラク" },              // UTC+3
          { iana: "Asia/Kuwait",     name: "クウェート" },          // UTC+3
          { iana: "Asia/Qatar",      name: "カタール" },            // UTC+3
          { iana: "Asia/Bahrain",    name: "バーレーン" },          // UTC+3
          { iana: "Asia/Riyadh",     name: "サウジアラビア" },      // UTC+3
          { iana: "Asia/Damascus",   name: "シリア" },              // UTC+3
          { iana: "Europe/Istanbul", name: "トルコ" },              // UTC+3
          { iana: "Asia/Aden",       name: "イエメン" },            // UTC+3
          { iana: "Asia/Tehran",     name: "イラン" },              // UTC+3:30
          { iana: "Asia/Yerevan",    name: "アルメニア" },          // UTC+4
          { iana: "Asia/Baku",       name: "アゼルバイジャン" },    // UTC+4
          { iana: "Asia/Tbilisi",    name: "ジョージア" },          // UTC+4
          { iana: "Asia/Dubai",      name: "UAE" },                 // UTC+4
          { iana: "Asia/Muscat",     name: "オマーン" },            // UTC+4
        ],
      },
      {
        label: "中央アジア",
        zones: [
          { iana: "Asia/Kabul",      name: "アフガニスタン" },      // UTC+4:30
          { iana: "Asia/Ashgabat",   name: "トルクメニスタン" },    // UTC+5
          { iana: "Asia/Tashkent",   name: "ウズベキスタン" },      // UTC+5 (統合)
          { iana: "Asia/Dushanbe",   name: "タジキスタン" },        // UTC+5
          { iana: "Asia/Almaty",     name: "カザフスタン" },        // UTC+5 (統合)
          { iana: "Asia/Bishkek",    name: "キルギス" },            // UTC+6
        ],
      },
      {
        label: "南アジア",
        zones: [
          { iana: "Asia/Karachi",    name: "パキスタン" },          // UTC+5
          { iana: "Indian/Maldives", name: "モルディブ" },          // UTC+5
          { iana: "Asia/Kolkata",    name: "インド" },              // UTC+5:30
          { iana: "Asia/Colombo",    name: "スリランカ" },          // UTC+5:30
          { iana: "Asia/Kathmandu",  name: "ネパール" },            // UTC+5:45
          { iana: "Asia/Dhaka",      name: "バングラデシュ" },      // UTC+6
          { iana: "Asia/Thimphu",    name: "ブータン" },            // UTC+6
          { iana: "Indian/Chagos",   name: "英領インド洋地域" },    // UTC+6
        ],
      },
      {
        label: "東南アジア",
        zones: [
          { iana: "Asia/Yangon",       name: "ミャンマー" },        // UTC+6:30
          { iana: "Asia/Bangkok",      name: "タイ" },              // UTC+7
          { iana: "Asia/Phnom_Penh",   name: "カンボジア" },        // UTC+7
          { iana: "Asia/Vientiane",    name: "ラオス" },            // UTC+7
          { iana: "Asia/Ho_Chi_Minh",  name: "ベトナム" },          // UTC+7
          { iana: "Asia/Jakarta",      name: "インドネシア西部", sub: "ジャカルタ・スマトラ・西カリマンタン" }, // UTC+7
          { iana: "Asia/Makassar",     name: "インドネシア中部", sub: "バリ・ロンボク・マカッサル・東カリマンタン" }, // UTC+8
          { iana: "Asia/Brunei",       name: "ブルネイ" },          // UTC+8
          { iana: "Asia/Kuala_Lumpur", name: "マレーシア" },        // UTC+8 (統合)
          { iana: "Asia/Singapore",    name: "シンガポール" },      // UTC+8
          { iana: "Asia/Manila",       name: "フィリピン" },        // UTC+8
          { iana: "Asia/Dili",         name: "東ティモール" },      // UTC+9
          { iana: "Asia/Jayapura",     name: "インドネシア東部", sub: "パプア・マルク" }, // UTC+9
        ],
      },
      {
        label: "東アジア",
        zones: [
          { iana: "Asia/Urumqi",       name: "中国西部", sub: "新疆" },     // UTC+6
          { iana: "Asia/Hovd",         name: "モンゴル西部", sub: "ホブド" }, // UTC+7
          { iana: "Asia/Hong_Kong",    name: "香港" },              // UTC+8
          { iana: "Asia/Macau",        name: "マカオ" },            // UTC+8
          { iana: "Asia/Shanghai",     name: "中国" },              // UTC+8
          { iana: "Asia/Taipei",       name: "台湾" },              // UTC+8
          { iana: "Asia/Ulaanbaatar",  name: "モンゴル" },          // UTC+8
          { iana: "Asia/Pyongyang",    name: "北朝鮮" },            // UTC+9
          { iana: "Asia/Seoul",        name: "韓国" },              // UTC+9
          { iana: "Asia/Tokyo",        name: "日本" },              // UTC+9
        ],
      },
    ],
  },
  {
    label: "太平洋・オセアニア",
    subGroups: [
      {
        label: "オーストラリア・NZ",
        zones: [
          { iana: "Australia/Perth",    name: "西オーストラリア", sub: "パース" },         // UTC+8
          { iana: "Australia/Darwin",   name: "ノーザンテリトリー", sub: "ダーウィン（夏時間なし）" }, // UTC+9:30
          { iana: "Australia/Adelaide", name: "南オーストラリア", sub: "アデレード（夏時間あり）" },   // UTC+9:30
          { iana: "Australia/Brisbane", name: "クイーンズランド", sub: "ブリスベン（夏時間なし）" },   // UTC+10
          { iana: "Australia/Sydney",   name: "オーストラリア東部", sub: "シドニー・メルボルン・キャンベラ・ホバート（夏時間あり）" }, // UTC+10
          { iana: "Pacific/Norfolk",    name: "ノーフォーク島" },   // UTC+11
          { iana: "Pacific/Auckland",   name: "ニュージーランド" }, // UTC+12
          { iana: "Pacific/Chatham",    name: "チャタム諸島" },     // UTC+12:45
        ],
      },
      {
        label: "メラネシア",
        zones: [
          { iana: "Pacific/Port_Moresby", name: "パプアニューギニア西部", sub: "ポートモレスビー" }, // UTC+10
          { iana: "Pacific/Bougainville", name: "パプアニューギニア東部", sub: "ブーゲンビル" },     // UTC+11
          { iana: "Pacific/Guadalcanal",  name: "ソロモン諸島" },   // UTC+11
          { iana: "Pacific/Efate",        name: "バヌアツ" },       // UTC+11
          { iana: "Pacific/Noumea",       name: "ニューカレドニア" }, // UTC+11
          { iana: "Pacific/Fiji",         name: "フィジー" },       // UTC+12
        ],
      },
      {
        label: "ミクロネシア",
        zones: [
          { iana: "Pacific/Palau",     name: "パラオ" },            // UTC+9
          { iana: "Pacific/Chuuk",     name: "ミクロネシア連邦西部", sub: "チューク" },    // UTC+10
          { iana: "Pacific/Guam",      name: "グアム" },            // UTC+10
          { iana: "Pacific/Saipan",    name: "北マリアナ諸島", sub: "サイパン" },         // UTC+10
          { iana: "Pacific/Pohnpei",   name: "ミクロネシア連邦東部", sub: "ポンペイ・コスラエ" }, // UTC+11
          { iana: "Pacific/Tarawa",    name: "キリバス西部", sub: "タラワ" },             // UTC+12
          { iana: "Pacific/Majuro",    name: "マーシャル諸島" },    // UTC+12 (統合)
          { iana: "Pacific/Nauru",     name: "ナウル" },            // UTC+12
          { iana: "Pacific/Wake",      name: "ウェーク島" },        // UTC+12
          { iana: "Pacific/Kanton",    name: "キリバス中部", sub: "カントン島" },          // UTC+13
          { iana: "Pacific/Kiritimati",name: "キリバス東部", sub: "クリスマス島" },        // UTC+14
        ],
      },
      {
        label: "ポリネシア",
        zones: [
          { iana: "Pacific/Midway",    name: "ミッドウェー島" },    // UTC-11
          { iana: "Pacific/Niue",      name: "ニウエ" },            // UTC-11
          { iana: "Pacific/Pago_Pago", name: "米領サモア" },        // UTC-11
          { iana: "Pacific/Rarotonga", name: "クック諸島" },        // UTC-10
          { iana: "Pacific/Tahiti",    name: "タヒチ", sub: "仏領ポリネシア西部" },       // UTC-10
          { iana: "Pacific/Marquesas", name: "マルケサス諸島", sub: "仏領ポリネシア" },   // UTC-9:30
          { iana: "Pacific/Gambier",   name: "ガンビエ諸島", sub: "仏領ポリネシア" },     // UTC-9
          { iana: "Pacific/Pitcairn",  name: "ピトケアン諸島" },    // UTC-8
          { iana: "Pacific/Apia",      name: "サモア" },            // UTC+13
          { iana: "Pacific/Fakaofo",   name: "トケラウ" },          // UTC+13
          { iana: "Pacific/Tongatapu", name: "トンガ" },            // UTC+13
          { iana: "Pacific/Funafuti",  name: "ツバル" },            // UTC+12
          { iana: "Pacific/Wallis",    name: "ウォリス・フツナ" },  // UTC+12
        ],
      },
    ],
  },
  {
    label: "ヨーロッパ",
    subGroups: [
      {
        label: "北欧",
        zones: [
          { iana: "Atlantic/Reykjavik",  name: "アイスランド" },    // UTC+0
          { iana: "Europe/Guernsey",     name: "ガーンジー" },      // UTC+0/+1
          { iana: "Europe/Jersey",       name: "ジャージー" },      // UTC+0/+1
          { iana: "Atlantic/Faroe",      name: "フェロー諸島" },    // UTC+0/+1
          { iana: "Europe/Dublin",       name: "アイルランド" },    // UTC+0/+1
          { iana: "Europe/Isle_of_Man",  name: "マン島" },          // UTC+0/+1
          { iana: "Europe/London",       name: "イギリス" },        // UTC+0/+1
          { iana: "Europe/Oslo",         name: "ノルウェー" },      // UTC+1
          { iana: "Arctic/Longyearbyen", name: "スバールバル" },    // UTC+1
          { iana: "Europe/Stockholm",    name: "スウェーデン" },    // UTC+1
          { iana: "Europe/Copenhagen",   name: "デンマーク" },      // UTC+1
          { iana: "Europe/Mariehamn",    name: "オーランド諸島" },  // UTC+2
          { iana: "Europe/Tallinn",      name: "エストニア" },      // UTC+2
          { iana: "Europe/Riga",         name: "ラトビア" },        // UTC+2
          { iana: "Europe/Vilnius",      name: "リトアニア" },      // UTC+2
          { iana: "Europe/Helsinki",     name: "フィンランド" },    // UTC+2
        ],
      },
      {
        label: "西欧",
        zones: [
          { iana: "Europe/Brussels",   name: "ベルギー" },          // UTC+1
          { iana: "Europe/Paris",      name: "フランス" },          // UTC+1
          { iana: "Europe/Berlin",     name: "ドイツ" },            // UTC+1 (統合)
          { iana: "Europe/Amsterdam",  name: "オランダ" },          // UTC+1
          { iana: "Europe/Luxembourg", name: "ルクセンブルク" },    // UTC+1
          { iana: "Europe/Monaco",     name: "モナコ" },            // UTC+1
          { iana: "Europe/Zurich",     name: "スイス" },            // UTC+1
          { iana: "Europe/Vaduz",      name: "リヒテンシュタイン" },// UTC+1
          { iana: "Europe/Vienna",     name: "オーストリア" },      // UTC+1
        ],
      },
      {
        label: "南欧",
        zones: [
          { iana: "Atlantic/Canary",   name: "カナリア諸島" },      // UTC+0/+1
          { iana: "Europe/Lisbon",     name: "ポルトガル" },        // UTC+0/+1
          { iana: "Atlantic/Azores",   name: "アゾレス諸島" },      // UTC-1/0
          { iana: "Europe/Madrid",     name: "スペイン" },          // UTC+1
          { iana: "Europe/Andorra",    name: "アンドラ" },          // UTC+1
          { iana: "Europe/Gibraltar",  name: "ジブラルタル" },      // UTC+1
          { iana: "Europe/Rome",       name: "イタリア" },          // UTC+1
          { iana: "Europe/Vatican",    name: "バチカン" },          // UTC+1
          { iana: "Europe/San_Marino", name: "サンマリノ" },        // UTC+1
          { iana: "Europe/Tirane",     name: "アルバニア" },        // UTC+1
          { iana: "Europe/Sarajevo",   name: "ボスニア・ヘルツェゴビナ" }, // UTC+1
          { iana: "Europe/Zagreb",     name: "クロアチア" },        // UTC+1
          { iana: "Europe/Podgorica",  name: "モンテネグロ" },      // UTC+1
          { iana: "Europe/Belgrade",   name: "セルビア" },          // UTC+1
          { iana: "Europe/Skopje",     name: "北マケドニア" },      // UTC+1
          { iana: "Europe/Ljubljana",  name: "スロベニア" },        // UTC+1
          { iana: "Europe/Malta",      name: "マルタ" },            // UTC+1
          { iana: "Europe/Athens",     name: "ギリシャ" },          // UTC+2
        ],
      },
      {
        label: "東欧",
        zones: [
          { iana: "Europe/Prague",       name: "チェコ" },          // UTC+1
          { iana: "Europe/Bratislava",   name: "スロバキア" },      // UTC+1
          { iana: "Europe/Warsaw",       name: "ポーランド" },      // UTC+1
          { iana: "Europe/Budapest",     name: "ハンガリー" },      // UTC+1
          { iana: "Europe/Kaliningrad",  name: "ロシア・カリーニングラード" }, // UTC+2
          { iana: "Europe/Sofia",        name: "ブルガリア" },      // UTC+2
          { iana: "Europe/Chisinau",     name: "モルドバ" },        // UTC+2
          { iana: "Europe/Bucharest",    name: "ルーマニア" },      // UTC+2
          { iana: "Europe/Kyiv",         name: "ウクライナ" },      // UTC+2
          { iana: "Europe/Minsk",        name: "ベラルーシ" },      // UTC+3
          { iana: "Europe/Moscow",       name: "ロシア西部", sub: "モスクワ・サンクトペテルブルク" }, // UTC+3
          { iana: "Europe/Samara",       name: "ロシア・サマラ", sub: "ヴォルガ地方" },    // UTC+4
          { iana: "Asia/Yekaterinburg",  name: "ロシア・エカテリンブルク", sub: "ウラル" },// UTC+5
          { iana: "Asia/Omsk",           name: "ロシア・オムスク", sub: "西シベリア" },    // UTC+6
          { iana: "Asia/Krasnoyarsk",    name: "ロシア・クラスノヤルスク", sub: "中央シベリア" }, // UTC+7
          { iana: "Asia/Irkutsk",        name: "ロシア・イルクーツク", sub: "バイカル湖周辺" }, // UTC+8
          { iana: "Asia/Yakutsk",        name: "ロシア・ヤクーツク", sub: "サハ共和国南部" }, // UTC+9
          { iana: "Asia/Vladivostok",    name: "ロシア・ウラジオストク", sub: "沿海州・ハバロフスク" }, // UTC+10
          { iana: "Asia/Sakhalin",       name: "ロシア・サハリン" },                       // UTC+11
          { iana: "Asia/Magadan",        name: "ロシア・マガダン" },                       // UTC+11
          { iana: "Asia/Kamchatka",      name: "ロシア・カムチャッカ" },                   // UTC+12
        ],
      },
    ],
  },
  {
    label: "アメリカ",
    subGroups: [
      {
        label: "北米",
        zones: [
          { iana: "Pacific/Honolulu",    name: "ハワイ" },                                         // UTC-10
          { iana: "America/Anchorage",   name: "アラスカ" },                                       // UTC-9
          { iana: "America/Los_Angeles", name: "太平洋時間", sub: "ロサンゼルス・サンフランシスコ・シアトル・バンクーバー" }, // UTC-8
          { iana: "America/Tijuana",     name: "メキシコ北西部", sub: "ティフアナ" },               // UTC-8
          { iana: "America/Phoenix",     name: "アリゾナ", sub: "フェニックス（夏時間なし）" },      // UTC-7
          { iana: "America/Denver",      name: "山岳部時間", sub: "デンバー・ソルトレイクシティ・カルガリー" }, // UTC-7
          { iana: "America/Chicago",     name: "中部時間", sub: "シカゴ・ダラス・ヒューストン・ウィニペグ" }, // UTC-6
          { iana: "America/Mexico_City", name: "メキシコ中部", sub: "メキシコシティ・グアダラハラ" }, // UTC-6
          { iana: "America/Belize",      name: "ベリーズ" },                                       // UTC-6
          { iana: "America/Guatemala",   name: "グアテマラ" },                                     // UTC-6
          { iana: "America/Tegucigalpa", name: "ホンジュラス" },                                   // UTC-6
          { iana: "America/Managua",     name: "ニカラグア" },                                     // UTC-6
          { iana: "America/El_Salvador", name: "エルサルバドル" },                                 // UTC-6
          { iana: "America/Costa_Rica",  name: "コスタリカ" },                                     // UTC-6
          { iana: "America/New_York",    name: "東部時間", sub: "ニューヨーク・マイアミ・トロント・アトランタ・ボストン" }, // UTC-5
          { iana: "America/Cancun",      name: "メキシコ東部", sub: "カンクン（夏時間なし）" },      // UTC-5
          { iana: "America/Panama",      name: "パナマ" },                                         // UTC-5
          { iana: "America/Halifax",     name: "大西洋時間", sub: "ハリファックス・ニューブランズウィック" }, // UTC-4
          { iana: "Atlantic/Bermuda",    name: "バミューダ" },                                     // UTC-4
          { iana: "America/St_Johns",    name: "ニューファンドランド" },                            // UTC-3:30
          { iana: "America/Nuuk",        name: "グリーンランド" },                                 // UTC-2
          { iana: "America/Scoresbysund",name: "グリーンランド東部", sub: "イトトコートミート" },    // UTC-1
          { iana: "America/Danmarkshavn",name: "グリーンランド北東部" },                            // UTC+0
          { iana: "America/Miquelon",    name: "サンピエール島・ミクロン島" },                      // UTC-3
        ],
      },
      {
        label: "カリブ海",
        zones: [
          { iana: "America/Cayman",       name: "ケイマン諸島" },   // UTC-5
          { iana: "America/Jamaica",       name: "ジャマイカ" },    // UTC-5
          { iana: "America/Nassau",        name: "バハマ" },        // UTC-5
          { iana: "America/Port-au-Prince",name: "ハイチ" },        // UTC-5
          { iana: "America/Grand_Turk",    name: "タークス・カイコス諸島" }, // UTC-5
          { iana: "America/Havana",        name: "キューバ" },      // UTC-5
          { iana: "America/Anguilla",      name: "アンギラ" },      // UTC-4
          { iana: "America/Antigua",       name: "アンティグア・バーブーダ" }, // UTC-4
          { iana: "America/Aruba",         name: "アルバ" },        // UTC-4
          { iana: "America/Barbados",      name: "バルバドス" },    // UTC-4
          { iana: "America/St_Barthelemy", name: "サン・バルテルミー" }, // UTC-4
          { iana: "America/Kralendijk",    name: "カリブ海オランダ", sub: "ボネール・サバ・シント・ユースタティウス" }, // UTC-4
          { iana: "America/Curacao",       name: "キュラソー" },    // UTC-4
          { iana: "America/Dominica",      name: "ドミニカ国" },    // UTC-4
          { iana: "America/Santo_Domingo", name: "ドミニカ共和国" },// UTC-4
          { iana: "America/Grenada",       name: "グレナダ" },      // UTC-4
          { iana: "America/Guadeloupe",    name: "グアドループ" },  // UTC-4
          { iana: "America/Martinique",    name: "マルティニーク" },// UTC-4
          { iana: "America/Marigot",       name: "サン・マルタン" },// UTC-4
          { iana: "America/Montserrat",    name: "モントセラト" },  // UTC-4
          { iana: "America/Puerto_Rico",   name: "プエルトリコ" },  // UTC-4
          { iana: "America/St_Kitts",      name: "セントクリストファー・ネビス" }, // UTC-4
          { iana: "America/St_Lucia",      name: "セントルシア" },  // UTC-4
          { iana: "America/Lower_Princes", name: "シント・マールテン" }, // UTC-4
          { iana: "America/Port_of_Spain", name: "トリニダード・トバゴ" }, // UTC-4
          { iana: "America/St_Thomas",     name: "米領ヴァージン諸島" }, // UTC-4
          { iana: "America/Tortola",       name: "英領ヴァージン諸島" }, // UTC-4
          { iana: "America/St_Vincent",    name: "セントビンセント・グレナディーン" }, // UTC-4
        ],
      },
      {
        label: "南米",
        zones: [
          { iana: "America/Guayaquil",           name: "エクアドル" },       // UTC-5
          { iana: "America/Lima",                name: "ペルー" },           // UTC-5
          { iana: "America/Bogota",              name: "コロンビア" },       // UTC-5
          { iana: "Pacific/Easter",              name: "イースター島" },     // UTC-6/DST (チリ領)
          { iana: "Pacific/Galapagos",           name: "ガラパゴス諸島" },   // UTC-6 (エクアドル領)
          { iana: "America/Caracas",             name: "ベネズエラ" },       // UTC-4
          { iana: "America/La_Paz",              name: "ボリビア" },         // UTC-4
          { iana: "America/Guyana",              name: "ガイアナ" },         // UTC-4
          { iana: "America/Manaus",              name: "ブラジル・アマゾン", sub: "マナウス" }, // UTC-4
          { iana: "America/Asuncion",            name: "パラグアイ" },       // UTC-4
          { iana: "America/Santiago",            name: "チリ" },             // UTC-3
          { iana: "America/Argentina/Buenos_Aires", name: "アルゼンチン" }, // UTC-3 (統合)
          { iana: "America/Sao_Paulo",           name: "ブラジル", sub: "サンパウロ・リオデジャネイロ・ブラジリア" }, // UTC-3
          { iana: "America/Cayenne",             name: "フランス領ギアナ" }, // UTC-3
          { iana: "America/Paramaribo",          name: "スリナム" },         // UTC-3
          { iana: "America/Montevideo",          name: "ウルグアイ" },       // UTC-3
          { iana: "Atlantic/Stanley",            name: "フォークランド諸島" }, // UTC-3
          { iana: "America/Noronha",             name: "フェルナンド・デ・ノローニャ島" }, // UTC-2
        ],
      },
    ],
  },
  {
    label: "アフリカ",
    subGroups: [
      {
        label: "北アフリカ",
        zones: [
          { iana: "Atlantic/Cape_Verde", name: "カーボベルデ" },    // UTC-1
          { iana: "Africa/Casablanca",   name: "モロッコ" },        // UTC+1
          { iana: "Africa/El_Aaiun",     name: "西サハラ" },        // UTC+1
          { iana: "Africa/Algiers",      name: "アルジェリア" },    // UTC+1
          { iana: "Africa/Tunis",        name: "チュニジア" },      // UTC+1
          { iana: "Africa/Cairo",        name: "エジプト" },        // UTC+2
          { iana: "Africa/Tripoli",      name: "リビア" },          // UTC+2
          { iana: "Africa/Khartoum",     name: "スーダン" },        // UTC+3
        ],
      },
      {
        label: "西アフリカ",
        zones: [
          { iana: "Africa/Abidjan",     name: "コートジボワール" }, // UTC+0
          { iana: "Africa/Accra",       name: "ガーナ" },          // UTC+0
          { iana: "Africa/Banjul",      name: "ガンビア" },        // UTC+0
          { iana: "Africa/Conakry",     name: "ギニア" },          // UTC+0
          { iana: "Africa/Bissau",      name: "ギニアビサウ" },    // UTC+0
          { iana: "Africa/Freetown",    name: "シエラレオネ" },    // UTC+0
          { iana: "Africa/Dakar",       name: "セネガル" },        // UTC+0
          { iana: "Africa/Lome",        name: "トーゴ" },          // UTC+0
          { iana: "Africa/Bamako",      name: "マリ" },            // UTC+0
          { iana: "Africa/Monrovia",    name: "リベリア" },        // UTC+0
          { iana: "Atlantic/St_Helena", name: "セントヘレナ" },    // UTC+0
          { iana: "Africa/Nouakchott",  name: "モーリタニア" },    // UTC+0
          { iana: "Africa/Ouagadougou", name: "ブルキナファソ" },  // UTC+0
          { iana: "Africa/Niamey",      name: "ニジェール" },      // UTC+1
          { iana: "Africa/Lagos",       name: "ナイジェリア" },    // UTC+1
          { iana: "Africa/Porto-Novo",  name: "ベナン" },          // UTC+1
        ],
      },
      {
        label: "中部アフリカ",
        zones: [
          { iana: "Africa/Sao_Tome",    name: "サントメ・プリンシペ" }, // UTC+0
          { iana: "Africa/Bangui",      name: "中央アフリカ共和国" }, // UTC+1
          { iana: "Africa/Douala",      name: "カメルーン" },      // UTC+1
          { iana: "Africa/Libreville",  name: "ガボン" },          // UTC+1
          { iana: "Africa/Brazzaville", name: "コンゴ共和国" },    // UTC+1
          { iana: "Africa/Kinshasa",    name: "コンゴ民主共和国西部", sub: "キンシャサ" }, // UTC+1
          { iana: "Africa/Malabo",      name: "赤道ギニア" },      // UTC+1
          { iana: "Africa/Ndjamena",    name: "チャド" },          // UTC+1
          { iana: "Africa/Luanda",      name: "アンゴラ" },        // UTC+1
          { iana: "Africa/Lubumbashi",  name: "コンゴ民主共和国東部", sub: "ルブンバシ" }, // UTC+2
        ],
      },
      {
        label: "東アフリカ",
        zones: [
          { iana: "Africa/Blantyre",       name: "マラウイ" },     // UTC+2
          { iana: "Africa/Maputo",         name: "モザンビーク" }, // UTC+2
          { iana: "Africa/Kigali",         name: "ルワンダ" },     // UTC+2
          { iana: "Africa/Bujumbura",      name: "ブルンジ" },     // UTC+2
          { iana: "Africa/Lusaka",         name: "ザンビア" },     // UTC+2
          { iana: "Africa/Harare",         name: "ジンバブエ" },   // UTC+2
          { iana: "Africa/Addis_Ababa",    name: "エチオピア" },   // UTC+3
          { iana: "Africa/Asmara",         name: "エリトリア" },   // UTC+3
          { iana: "Africa/Dar_es_Salaam",  name: "タンザニア" },   // UTC+3
          { iana: "Africa/Djibouti",       name: "ジブチ" },       // UTC+3
          { iana: "Africa/Juba",           name: "南スーダン" },   // UTC+3
          { iana: "Africa/Kampala",        name: "ウガンダ" },     // UTC+3
          { iana: "Africa/Mogadishu",      name: "ソマリア" },     // UTC+3
          { iana: "Africa/Nairobi",        name: "ケニア" },       // UTC+3
          { iana: "Indian/Antananarivo",   name: "マダガスカル" }, // UTC+3
          { iana: "Indian/Comoro",         name: "コモロ" },       // UTC+3
          { iana: "Indian/Mayotte",        name: "マイヨット" },   // UTC+3
          { iana: "Indian/Mauritius",      name: "モーリシャス" }, // UTC+4
          { iana: "Indian/Reunion",        name: "レユニオン" },   // UTC+4
          { iana: "Indian/Mahe",           name: "セーシェル" },   // UTC+4
        ],
      },
      {
        label: "南部アフリカ",
        zones: [
          { iana: "Africa/Gaborone",  name: "ボツワナ" },          // UTC+2
          { iana: "Africa/Maseru",    name: "レソト" },            // UTC+2
          { iana: "Africa/Windhoek",  name: "ナミビア" },          // UTC+2
          { iana: "Africa/Mbabane",   name: "エスワティニ" },      // UTC+2
          { iana: "Africa/Johannesburg", name: "南アフリカ" },     // UTC+2
        ],
      },
    ],
  },
];

const ALL_TZ_MAP = new Map(
  TZ_GROUPS.flatMap((g) =>
    g.subGroups.flatMap((sg) => sg.zones.map((z) => [z.iana, z])),
  ),
);

export function TimezonePicker({
  name,
  value,
  onChange,
}: {
  name?: string;
  value: string;
  onChange: (iana: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groupLabel, setGroupLabel] = useState<string | null>(null);
  const [subGroupLabel, setSubGroupLabel] = useState<string | null>(null);

  const group = TZ_GROUPS.find((g) => g.label === groupLabel) ?? null;
  const subGroup =
    group?.subGroups.find((sg) => sg.label === subGroupLabel) ?? null;
  const label = tzDisplayLabel(value);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setGroupLabel(null);
      setSubGroupLabel(null);
    }
  };

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover.Root open={open} onOpenChange={handleOpenChange} modal={false}>
        <Popover.Trigger
          type="button"
          className={`flex w-full items-center justify-between gap-2 text-left ${inputClass} group`}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronIcon
            size={16}
            className="shrink-0 rotate-90 text-subtle-foreground transition group-aria-expanded:rotate-[-90deg]"
          />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner sideOffset={4} className="z-50">
            <Popover.Popup className="max-h-64 w-[var(--anchor-width)] min-w-[22rem] overflow-y-auto rounded-md border border-foreground/20 bg-background py-1 shadow-lg outline-none">
              {!group ? (
                // Step 1: 大陸グループ一覧
                TZ_GROUPS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => setGroupLabel(g.label)}
                    className={`flex items-center justify-between gap-2 ${menuItemClass}`}
                  >
                    <span>{g.label}</span>
                    <ChevronIcon
                      size={16}
                      className="shrink-0 rotate-90 text-subtle-foreground"
                    />
                  </button>
                ))
              ) : !subGroup ? (
                // Step 2: サブ地域一覧
                <>
                  <button
                    type="button"
                    onClick={() => setGroupLabel(null)}
                    className={`flex items-center gap-2 border-b border-foreground/10 font-medium ${menuItemClass}`}
                  >
                    <ChevronIcon
                      size={16}
                      className="-rotate-90 text-muted-foreground"
                    />
                    <span>{group.label}</span>
                  </button>
                  {group.subGroups.map((sg) => (
                    <button
                      key={sg.label}
                      type="button"
                      onClick={() => setSubGroupLabel(sg.label)}
                      className={`flex items-center justify-between gap-2 ${menuItemClass}`}
                    >
                      <span>{sg.label}</span>
                      <ChevronIcon
                        size={16}
                        className="shrink-0 rotate-90 text-subtle-foreground"
                      />
                    </button>
                  ))}
                </>
              ) : (
                // Step 3: ゾーン一覧
                <>
                  <button
                    type="button"
                    onClick={() => setSubGroupLabel(null)}
                    className={`flex items-center gap-2 border-b border-foreground/10 font-medium ${menuItemClass}`}
                  >
                    <ChevronIcon
                      size={16}
                      className="-rotate-90 text-muted-foreground"
                    />
                    <span>{subGroup.label}</span>
                  </button>
                  {subGroup.zones.map((zone) => (
                    <button
                      key={zone.iana}
                      type="button"
                      onClick={() => {
                        onChange(zone.iana);
                        setOpen(false);
                      }}
                      className={`flex items-center justify-between gap-2 ${menuItemClass} ${
                        zone.iana === value ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{zone.name}</span>
                        {zone.sub && (
                          <span className="block truncate text-xs font-normal text-muted-foreground">
                            {zone.sub}
                          </span>
                        )}
                      </span>
                      {zone.iana === value && (
                        <CheckIcon
                          size={16}
                          className="shrink-0 text-muted-foreground"
                        />
                      )}
                    </button>
                  ))}
                </>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
