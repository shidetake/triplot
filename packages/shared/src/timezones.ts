// タイムゾーンの収録リスト（web/RN 共用の単一の真実）。
// 収録方針・命名ルール・並び順は docs/ui-guidelines.md
// 「タイムゾーンピッカーの命名ルール」参照。
// 3段構成: 大陸グループ → UN サブ地域 → 国/ゾーン。

export type TzZone = {
  iana: string;
  name: string;
  nameEn: string;
  sub?: string;
  subEn?: string;
};
export type TzSubGroup = { label: string; labelEn: string; zones: TzZone[] };
export type TzGroup = {
  label: string;
  labelEn: string;
  subGroups: TzSubGroup[];
};

// 収録方針・命名ルール・並び順は docs/ui-guidelines.md「タイムゾーンピッカーの命名ルール」参照。
// 3段構成: 大陸グループ → UN サブ地域 → 国/ゾーン
// 並び順: サブ地域内は UTC オフセット昇順、同値は五十音順
export const TZ_GROUPS: TzGroup[] = [
  {
    label: "アジア",
    labelEn: "Asia",
    subGroups: [
      {
        label: "西アジア",
        labelEn: "Western Asia",
        zones: [
          { iana: "Asia/Nicosia", name: "キプロス", nameEn: "Cyprus" }, // UTC+2
          { iana: "Asia/Gaza", name: "パレスチナ", nameEn: "Palestine" }, // UTC+2 (Gaza+Hebron 統合)
          { iana: "Asia/Jerusalem", name: "イスラエル", nameEn: "Israel" }, // UTC+2
          { iana: "Asia/Beirut", name: "レバノン", nameEn: "Lebanon" }, // UTC+2
          { iana: "Asia/Amman", name: "ヨルダン", nameEn: "Jordan" }, // UTC+3
          { iana: "Asia/Baghdad", name: "イラク", nameEn: "Iraq" }, // UTC+3
          { iana: "Asia/Kuwait", name: "クウェート", nameEn: "Kuwait" }, // UTC+3
          { iana: "Asia/Qatar", name: "カタール", nameEn: "Qatar" }, // UTC+3
          { iana: "Asia/Bahrain", name: "バーレーン", nameEn: "Bahrain" }, // UTC+3
          {
            iana: "Asia/Riyadh",
            name: "サウジアラビア",
            nameEn: "Saudi Arabia",
          }, // UTC+3
          { iana: "Asia/Damascus", name: "シリア", nameEn: "Syria" }, // UTC+3
          { iana: "Europe/Istanbul", name: "トルコ", nameEn: "Türkiye" }, // UTC+3
          { iana: "Asia/Aden", name: "イエメン", nameEn: "Yemen" }, // UTC+3
          { iana: "Asia/Tehran", name: "イラン", nameEn: "Iran" }, // UTC+3:30
          { iana: "Asia/Yerevan", name: "アルメニア", nameEn: "Armenia" }, // UTC+4
          { iana: "Asia/Baku", name: "アゼルバイジャン", nameEn: "Azerbaijan" }, // UTC+4
          { iana: "Asia/Tbilisi", name: "ジョージア", nameEn: "Georgia" }, // UTC+4
          { iana: "Asia/Dubai", name: "UAE", nameEn: "UAE" }, // UTC+4
          { iana: "Asia/Muscat", name: "オマーン", nameEn: "Oman" }, // UTC+4
        ],
      },
      {
        label: "中央アジア",
        labelEn: "Central Asia",
        zones: [
          { iana: "Asia/Kabul", name: "アフガニスタン", nameEn: "Afghanistan" }, // UTC+4:30
          {
            iana: "Asia/Ashgabat",
            name: "トルクメニスタン",
            nameEn: "Turkmenistan",
          }, // UTC+5
          {
            iana: "Asia/Tashkent",
            name: "ウズベキスタン",
            nameEn: "Uzbekistan",
          }, // UTC+5 (統合)
          { iana: "Asia/Dushanbe", name: "タジキスタン", nameEn: "Tajikistan" }, // UTC+5
          { iana: "Asia/Almaty", name: "カザフスタン", nameEn: "Kazakhstan" }, // UTC+5 (統合)
          { iana: "Asia/Bishkek", name: "キルギス", nameEn: "Kyrgyzstan" }, // UTC+6
        ],
      },
      {
        label: "南アジア",
        labelEn: "Southern Asia",
        zones: [
          { iana: "Asia/Karachi", name: "パキスタン", nameEn: "Pakistan" }, // UTC+5
          { iana: "Indian/Maldives", name: "モルディブ", nameEn: "Maldives" }, // UTC+5
          { iana: "Asia/Kolkata", name: "インド", nameEn: "India" }, // UTC+5:30
          { iana: "Asia/Colombo", name: "スリランカ", nameEn: "Sri Lanka" }, // UTC+5:30
          { iana: "Asia/Kathmandu", name: "ネパール", nameEn: "Nepal" }, // UTC+5:45
          { iana: "Asia/Dhaka", name: "バングラデシュ", nameEn: "Bangladesh" }, // UTC+6
          { iana: "Asia/Thimphu", name: "ブータン", nameEn: "Bhutan" }, // UTC+6
          {
            iana: "Indian/Chagos",
            name: "英領インド洋地域",
            nameEn: "British Indian Ocean Territory",
          }, // UTC+6
        ],
      },
      {
        label: "東南アジア",
        labelEn: "Southeast Asia",
        zones: [
          { iana: "Asia/Yangon", name: "ミャンマー", nameEn: "Myanmar" }, // UTC+6:30
          { iana: "Asia/Bangkok", name: "タイ", nameEn: "Thailand" }, // UTC+7
          { iana: "Asia/Phnom_Penh", name: "カンボジア", nameEn: "Cambodia" }, // UTC+7
          { iana: "Asia/Vientiane", name: "ラオス", nameEn: "Laos" }, // UTC+7
          { iana: "Asia/Ho_Chi_Minh", name: "ベトナム", nameEn: "Vietnam" }, // UTC+7
          {
            iana: "Asia/Jakarta",
            name: "インドネシア西部",
            nameEn: "Western Indonesia",
            sub: "ジャカルタ・スマトラ・西カリマンタン",
            subEn: "Jakarta, Sumatra, West Kalimantan",
          }, // UTC+7
          {
            iana: "Asia/Makassar",
            name: "インドネシア中部",
            nameEn: "Central Indonesia",
            sub: "バリ・ロンボク・マカッサル・東カリマンタン",
            subEn: "Bali, Lombok, Makassar, East Kalimantan",
          }, // UTC+8
          { iana: "Asia/Brunei", name: "ブルネイ", nameEn: "Brunei" }, // UTC+8
          { iana: "Asia/Kuala_Lumpur", name: "マレーシア", nameEn: "Malaysia" }, // UTC+8 (統合)
          { iana: "Asia/Singapore", name: "シンガポール", nameEn: "Singapore" }, // UTC+8
          { iana: "Asia/Manila", name: "フィリピン", nameEn: "Philippines" }, // UTC+8
          { iana: "Asia/Dili", name: "東ティモール", nameEn: "Timor-Leste" }, // UTC+9
          {
            iana: "Asia/Jayapura",
            name: "インドネシア東部",
            nameEn: "Eastern Indonesia",
            sub: "パプア・マルク",
            subEn: "Papua, Maluku",
          }, // UTC+9
        ],
      },
      {
        label: "東アジア",
        labelEn: "Eastern Asia",
        zones: [
          {
            iana: "Asia/Urumqi",
            name: "中国西部",
            nameEn: "Western China",
            sub: "新疆",
            subEn: "Xinjiang",
          }, // UTC+6
          {
            iana: "Asia/Hovd",
            name: "モンゴル西部",
            nameEn: "Western Mongolia",
            sub: "ホブド",
            subEn: "Hovd",
          }, // UTC+7
          { iana: "Asia/Hong_Kong", name: "香港", nameEn: "Hong Kong" }, // UTC+8
          { iana: "Asia/Macau", name: "マカオ", nameEn: "Macau" }, // UTC+8
          { iana: "Asia/Shanghai", name: "中国", nameEn: "China" }, // UTC+8
          { iana: "Asia/Taipei", name: "台湾", nameEn: "Taiwan" }, // UTC+8
          { iana: "Asia/Ulaanbaatar", name: "モンゴル", nameEn: "Mongolia" }, // UTC+8
          { iana: "Asia/Pyongyang", name: "北朝鮮", nameEn: "North Korea" }, // UTC+9
          { iana: "Asia/Seoul", name: "韓国", nameEn: "South Korea" }, // UTC+9
          { iana: "Asia/Tokyo", name: "日本", nameEn: "Japan" }, // UTC+9
        ],
      },
    ],
  },
  {
    label: "太平洋・オセアニア",
    labelEn: "Pacific & Oceania",
    subGroups: [
      {
        label: "オーストラリア・NZ",
        labelEn: "Australia & NZ",
        zones: [
          {
            iana: "Australia/Perth",
            name: "西オーストラリア",
            nameEn: "Western Australia",
            sub: "パース",
            subEn: "Perth",
          }, // UTC+8
          {
            iana: "Australia/Darwin",
            name: "ノーザンテリトリー",
            nameEn: "Northern Territory",
            sub: "ダーウィン（夏時間なし）",
            subEn: "Darwin (no DST)",
          }, // UTC+9:30
          {
            iana: "Australia/Adelaide",
            name: "南オーストラリア",
            nameEn: "South Australia",
            sub: "アデレード（夏時間あり）",
            subEn: "Adelaide (DST)",
          }, // UTC+9:30
          {
            iana: "Australia/Brisbane",
            name: "クイーンズランド",
            nameEn: "Queensland",
            sub: "ブリスベン（夏時間なし）",
            subEn: "Brisbane (no DST)",
          }, // UTC+10
          {
            iana: "Australia/Sydney",
            name: "オーストラリア東部",
            nameEn: "Eastern Australia",
            sub: "シドニー・メルボルン・キャンベラ・ホバート（夏時間あり）",
            subEn: "Sydney, Melbourne, Canberra, Hobart (DST)",
          }, // UTC+10
          {
            iana: "Pacific/Norfolk",
            name: "ノーフォーク島",
            nameEn: "Norfolk Island",
          }, // UTC+11
          {
            iana: "Pacific/Auckland",
            name: "ニュージーランド",
            nameEn: "New Zealand",
          }, // UTC+12
          {
            iana: "Pacific/Chatham",
            name: "チャタム諸島",
            nameEn: "Chatham Islands",
          }, // UTC+12:45
        ],
      },
      {
        label: "メラネシア",
        labelEn: "Melanesia",
        zones: [
          {
            iana: "Pacific/Port_Moresby",
            name: "パプアニューギニア西部",
            nameEn: "Western Papua New Guinea",
            sub: "ポートモレスビー",
            subEn: "Port Moresby",
          }, // UTC+10
          {
            iana: "Pacific/Bougainville",
            name: "パプアニューギニア東部",
            nameEn: "Eastern Papua New Guinea",
            sub: "ブーゲンビル",
            subEn: "Bougainville",
          }, // UTC+11
          {
            iana: "Pacific/Guadalcanal",
            name: "ソロモン諸島",
            nameEn: "Solomon Islands",
          }, // UTC+11
          { iana: "Pacific/Efate", name: "バヌアツ", nameEn: "Vanuatu" }, // UTC+11
          {
            iana: "Pacific/Noumea",
            name: "ニューカレドニア",
            nameEn: "New Caledonia",
          }, // UTC+11
          { iana: "Pacific/Fiji", name: "フィジー", nameEn: "Fiji" }, // UTC+12
        ],
      },
      {
        label: "ミクロネシア",
        labelEn: "Micronesia",
        zones: [
          { iana: "Pacific/Palau", name: "パラオ", nameEn: "Palau" }, // UTC+9
          {
            iana: "Pacific/Chuuk",
            name: "ミクロネシア連邦西部",
            nameEn: "Western Micronesia",
            sub: "チューク",
            subEn: "Chuuk",
          }, // UTC+10
          { iana: "Pacific/Guam", name: "グアム", nameEn: "Guam" }, // UTC+10
          {
            iana: "Pacific/Saipan",
            name: "北マリアナ諸島",
            nameEn: "Northern Mariana Islands",
            sub: "サイパン",
            subEn: "Saipan",
          }, // UTC+10
          {
            iana: "Pacific/Pohnpei",
            name: "ミクロネシア連邦東部",
            nameEn: "Eastern Micronesia",
            sub: "ポンペイ・コスラエ",
            subEn: "Pohnpei, Kosrae",
          }, // UTC+11
          {
            iana: "Pacific/Tarawa",
            name: "キリバス西部",
            nameEn: "Western Kiribati",
            sub: "タラワ",
            subEn: "Tarawa",
          }, // UTC+12
          {
            iana: "Pacific/Majuro",
            name: "マーシャル諸島",
            nameEn: "Marshall Islands",
          }, // UTC+12 (統合)
          { iana: "Pacific/Nauru", name: "ナウル", nameEn: "Nauru" }, // UTC+12
          { iana: "Pacific/Wake", name: "ウェーク島", nameEn: "Wake Island" }, // UTC+12
          {
            iana: "Pacific/Kanton",
            name: "キリバス中部",
            nameEn: "Central Kiribati",
            sub: "カントン島",
            subEn: "Kanton",
          }, // UTC+13
          {
            iana: "Pacific/Kiritimati",
            name: "キリバス東部",
            nameEn: "Eastern Kiribati",
            sub: "クリスマス島",
            subEn: "Kiritimati",
          }, // UTC+14
        ],
      },
      {
        label: "ポリネシア",
        labelEn: "Polynesia",
        zones: [
          { iana: "Pacific/Midway", name: "ミッドウェー島", nameEn: "Midway" }, // UTC-11
          { iana: "Pacific/Niue", name: "ニウエ", nameEn: "Niue" }, // UTC-11
          {
            iana: "Pacific/Pago_Pago",
            name: "米領サモア",
            nameEn: "American Samoa",
          }, // UTC-11
          {
            iana: "Pacific/Rarotonga",
            name: "クック諸島",
            nameEn: "Cook Islands",
          }, // UTC-10
          {
            iana: "Pacific/Tahiti",
            name: "タヒチ",
            nameEn: "Tahiti",
            sub: "仏領ポリネシア西部",
            subEn: "Western French Polynesia",
          }, // UTC-10
          {
            iana: "Pacific/Marquesas",
            name: "マルケサス諸島",
            nameEn: "Marquesas Islands",
            sub: "仏領ポリネシア",
            subEn: "French Polynesia",
          }, // UTC-9:30
          {
            iana: "Pacific/Gambier",
            name: "ガンビエ諸島",
            nameEn: "Gambier Islands",
            sub: "仏領ポリネシア",
            subEn: "French Polynesia",
          }, // UTC-9
          {
            iana: "Pacific/Pitcairn",
            name: "ピトケアン諸島",
            nameEn: "Pitcairn Islands",
          }, // UTC-8
          { iana: "Pacific/Apia", name: "サモア", nameEn: "Samoa" }, // UTC+13
          { iana: "Pacific/Fakaofo", name: "トケラウ", nameEn: "Tokelau" }, // UTC+13
          { iana: "Pacific/Tongatapu", name: "トンガ", nameEn: "Tonga" }, // UTC+13
          { iana: "Pacific/Funafuti", name: "ツバル", nameEn: "Tuvalu" }, // UTC+12
          {
            iana: "Pacific/Wallis",
            name: "ウォリス・フツナ",
            nameEn: "Wallis and Futuna",
          }, // UTC+12
        ],
      },
    ],
  },
  {
    label: "ヨーロッパ",
    labelEn: "Europe",
    subGroups: [
      {
        label: "北欧",
        labelEn: "Northern Europe",
        zones: [
          {
            iana: "Atlantic/Reykjavik",
            name: "アイスランド",
            nameEn: "Iceland",
          }, // UTC+0
          { iana: "Europe/Guernsey", name: "ガーンジー", nameEn: "Guernsey" }, // UTC+0/+1
          { iana: "Europe/Jersey", name: "ジャージー", nameEn: "Jersey" }, // UTC+0/+1
          {
            iana: "Atlantic/Faroe",
            name: "フェロー諸島",
            nameEn: "Faroe Islands",
          }, // UTC+0/+1
          { iana: "Europe/Dublin", name: "アイルランド", nameEn: "Ireland" }, // UTC+0/+1
          { iana: "Europe/Isle_of_Man", name: "マン島", nameEn: "Isle of Man" }, // UTC+0/+1
          { iana: "Europe/London", name: "イギリス", nameEn: "United Kingdom" }, // UTC+0/+1
          { iana: "Europe/Oslo", name: "ノルウェー", nameEn: "Norway" }, // UTC+1
          {
            iana: "Arctic/Longyearbyen",
            name: "スバールバル",
            nameEn: "Svalbard",
          }, // UTC+1
          { iana: "Europe/Stockholm", name: "スウェーデン", nameEn: "Sweden" }, // UTC+1
          { iana: "Europe/Copenhagen", name: "デンマーク", nameEn: "Denmark" }, // UTC+1
          {
            iana: "Europe/Mariehamn",
            name: "オーランド諸島",
            nameEn: "Åland Islands",
          }, // UTC+2
          { iana: "Europe/Tallinn", name: "エストニア", nameEn: "Estonia" }, // UTC+2
          { iana: "Europe/Riga", name: "ラトビア", nameEn: "Latvia" }, // UTC+2
          { iana: "Europe/Vilnius", name: "リトアニア", nameEn: "Lithuania" }, // UTC+2
          { iana: "Europe/Helsinki", name: "フィンランド", nameEn: "Finland" }, // UTC+2
        ],
      },
      {
        label: "西欧",
        labelEn: "Western Europe",
        zones: [
          { iana: "Europe/Brussels", name: "ベルギー", nameEn: "Belgium" }, // UTC+1
          { iana: "Europe/Paris", name: "フランス", nameEn: "France" }, // UTC+1
          { iana: "Europe/Berlin", name: "ドイツ", nameEn: "Germany" }, // UTC+1 (統合)
          { iana: "Europe/Amsterdam", name: "オランダ", nameEn: "Netherlands" }, // UTC+1
          {
            iana: "Europe/Luxembourg",
            name: "ルクセンブルク",
            nameEn: "Luxembourg",
          }, // UTC+1
          { iana: "Europe/Monaco", name: "モナコ", nameEn: "Monaco" }, // UTC+1
          { iana: "Europe/Zurich", name: "スイス", nameEn: "Switzerland" }, // UTC+1
          {
            iana: "Europe/Vaduz",
            name: "リヒテンシュタイン",
            nameEn: "Liechtenstein",
          }, // UTC+1
          { iana: "Europe/Vienna", name: "オーストリア", nameEn: "Austria" }, // UTC+1
        ],
      },
      {
        label: "南欧",
        labelEn: "Southern Europe",
        zones: [
          {
            iana: "Atlantic/Canary",
            name: "カナリア諸島",
            nameEn: "Canary Islands",
          }, // UTC+0/+1
          { iana: "Europe/Lisbon", name: "ポルトガル", nameEn: "Portugal" }, // UTC+0/+1
          { iana: "Atlantic/Azores", name: "アゾレス諸島", nameEn: "Azores" }, // UTC-1/0
          { iana: "Europe/Madrid", name: "スペイン", nameEn: "Spain" }, // UTC+1
          { iana: "Europe/Andorra", name: "アンドラ", nameEn: "Andorra" }, // UTC+1
          {
            iana: "Europe/Gibraltar",
            name: "ジブラルタル",
            nameEn: "Gibraltar",
          }, // UTC+1
          { iana: "Europe/Rome", name: "イタリア", nameEn: "Italy" }, // UTC+1
          { iana: "Europe/Vatican", name: "バチカン", nameEn: "Vatican City" }, // UTC+1
          {
            iana: "Europe/San_Marino",
            name: "サンマリノ",
            nameEn: "San Marino",
          }, // UTC+1
          { iana: "Europe/Tirane", name: "アルバニア", nameEn: "Albania" }, // UTC+1
          {
            iana: "Europe/Sarajevo",
            name: "ボスニア・ヘルツェゴビナ",
            nameEn: "Bosnia and Herzegovina",
          }, // UTC+1
          { iana: "Europe/Zagreb", name: "クロアチア", nameEn: "Croatia" }, // UTC+1
          {
            iana: "Europe/Podgorica",
            name: "モンテネグロ",
            nameEn: "Montenegro",
          }, // UTC+1
          { iana: "Europe/Belgrade", name: "セルビア", nameEn: "Serbia" }, // UTC+1
          {
            iana: "Europe/Skopje",
            name: "北マケドニア",
            nameEn: "North Macedonia",
          }, // UTC+1
          { iana: "Europe/Ljubljana", name: "スロベニア", nameEn: "Slovenia" }, // UTC+1
          { iana: "Europe/Malta", name: "マルタ", nameEn: "Malta" }, // UTC+1
          { iana: "Europe/Athens", name: "ギリシャ", nameEn: "Greece" }, // UTC+2
        ],
      },
      {
        label: "東欧",
        labelEn: "Eastern Europe",
        zones: [
          { iana: "Europe/Prague", name: "チェコ", nameEn: "Czechia" }, // UTC+1
          { iana: "Europe/Bratislava", name: "スロバキア", nameEn: "Slovakia" }, // UTC+1
          { iana: "Europe/Warsaw", name: "ポーランド", nameEn: "Poland" }, // UTC+1
          { iana: "Europe/Budapest", name: "ハンガリー", nameEn: "Hungary" }, // UTC+1
          {
            iana: "Europe/Kaliningrad",
            name: "ロシア・カリーニングラード",
            nameEn: "Russia – Kaliningrad",
          }, // UTC+2
          { iana: "Europe/Sofia", name: "ブルガリア", nameEn: "Bulgaria" }, // UTC+2
          { iana: "Europe/Chisinau", name: "モルドバ", nameEn: "Moldova" }, // UTC+2
          { iana: "Europe/Bucharest", name: "ルーマニア", nameEn: "Romania" }, // UTC+2
          { iana: "Europe/Kyiv", name: "ウクライナ", nameEn: "Ukraine" }, // UTC+2
          { iana: "Europe/Minsk", name: "ベラルーシ", nameEn: "Belarus" }, // UTC+3
          {
            iana: "Europe/Moscow",
            name: "ロシア西部",
            nameEn: "Western Russia",
            sub: "モスクワ・サンクトペテルブルク",
            subEn: "Moscow, Saint Petersburg",
          }, // UTC+3
          {
            iana: "Europe/Samara",
            name: "ロシア・サマラ",
            nameEn: "Russia – Samara",
            sub: "ヴォルガ地方",
            subEn: "Volga region",
          }, // UTC+4
          {
            iana: "Asia/Yekaterinburg",
            name: "ロシア・エカテリンブルク",
            nameEn: "Russia – Yekaterinburg",
            sub: "ウラル",
            subEn: "Urals",
          }, // UTC+5
          {
            iana: "Asia/Omsk",
            name: "ロシア・オムスク",
            nameEn: "Russia – Omsk",
            sub: "西シベリア",
            subEn: "Western Siberia",
          }, // UTC+6
          {
            iana: "Asia/Krasnoyarsk",
            name: "ロシア・クラスノヤルスク",
            nameEn: "Russia – Krasnoyarsk",
            sub: "中央シベリア",
            subEn: "Central Siberia",
          }, // UTC+7
          {
            iana: "Asia/Irkutsk",
            name: "ロシア・イルクーツク",
            nameEn: "Russia – Irkutsk",
            sub: "バイカル湖周辺",
            subEn: "Lake Baikal",
          }, // UTC+8
          {
            iana: "Asia/Yakutsk",
            name: "ロシア・ヤクーツク",
            nameEn: "Russia – Yakutsk",
            sub: "サハ共和国南部",
            subEn: "Southern Sakha",
          }, // UTC+9
          {
            iana: "Asia/Vladivostok",
            name: "ロシア・ウラジオストク",
            nameEn: "Russia – Vladivostok",
            sub: "沿海州・ハバロフスク",
            subEn: "Primorsky, Khabarovsk",
          }, // UTC+10
          {
            iana: "Asia/Sakhalin",
            name: "ロシア・サハリン",
            nameEn: "Russia – Sakhalin",
          }, // UTC+11
          {
            iana: "Asia/Magadan",
            name: "ロシア・マガダン",
            nameEn: "Russia – Magadan",
          }, // UTC+11
          {
            iana: "Asia/Kamchatka",
            name: "ロシア・カムチャッカ",
            nameEn: "Russia – Kamchatka",
          }, // UTC+12
        ],
      },
    ],
  },
  {
    label: "アメリカ",
    labelEn: "Americas",
    subGroups: [
      {
        label: "北米",
        labelEn: "North America",
        zones: [
          { iana: "Pacific/Honolulu", name: "ハワイ", nameEn: "Hawaii" }, // UTC-10
          { iana: "America/Anchorage", name: "アラスカ", nameEn: "Alaska" }, // UTC-9
          {
            iana: "America/Los_Angeles",
            name: "太平洋時間",
            nameEn: "Pacific Time",
            sub: "ロサンゼルス・サンフランシスコ・シアトル・バンクーバー",
            subEn: "Los Angeles, San Francisco, Seattle, Vancouver",
          }, // UTC-8
          {
            iana: "America/Tijuana",
            name: "メキシコ北西部",
            nameEn: "Northwest Mexico",
            sub: "ティフアナ",
            subEn: "Tijuana",
          }, // UTC-8
          {
            iana: "America/Phoenix",
            name: "アリゾナ",
            nameEn: "Arizona",
            sub: "フェニックス（夏時間なし）",
            subEn: "Phoenix (no DST)",
          }, // UTC-7
          {
            iana: "America/Denver",
            name: "山岳部時間",
            nameEn: "Mountain Time",
            sub: "デンバー・ソルトレイクシティ・カルガリー",
            subEn: "Denver, Salt Lake City, Calgary",
          }, // UTC-7
          {
            iana: "America/Chicago",
            name: "中部時間",
            nameEn: "Central Time",
            sub: "シカゴ・ダラス・ヒューストン・ウィニペグ",
            subEn: "Chicago, Dallas, Houston, Winnipeg",
          }, // UTC-6
          {
            iana: "America/Mexico_City",
            name: "メキシコ中部",
            nameEn: "Central Mexico",
            sub: "メキシコシティ・グアダラハラ",
            subEn: "Mexico City, Guadalajara",
          }, // UTC-6
          { iana: "America/Belize", name: "ベリーズ", nameEn: "Belize" }, // UTC-6
          {
            iana: "America/Guatemala",
            name: "グアテマラ",
            nameEn: "Guatemala",
          }, // UTC-6
          {
            iana: "America/Tegucigalpa",
            name: "ホンジュラス",
            nameEn: "Honduras",
          }, // UTC-6
          { iana: "America/Managua", name: "ニカラグア", nameEn: "Nicaragua" }, // UTC-6
          {
            iana: "America/El_Salvador",
            name: "エルサルバドル",
            nameEn: "El Salvador",
          }, // UTC-6
          {
            iana: "America/Costa_Rica",
            name: "コスタリカ",
            nameEn: "Costa Rica",
          }, // UTC-6
          {
            iana: "America/New_York",
            name: "東部時間",
            nameEn: "Eastern Time",
            sub: "ニューヨーク・マイアミ・トロント・アトランタ・ボストン",
            subEn: "New York, Miami, Toronto, Atlanta, Boston",
          }, // UTC-5
          {
            iana: "America/Cancun",
            name: "メキシコ東部",
            nameEn: "Eastern Mexico",
            sub: "カンクン（夏時間なし）",
            subEn: "Cancún (no DST)",
          }, // UTC-5
          { iana: "America/Panama", name: "パナマ", nameEn: "Panama" }, // UTC-5
          {
            iana: "America/Halifax",
            name: "大西洋時間",
            nameEn: "Atlantic Time",
            sub: "ハリファックス・ニューブランズウィック",
            subEn: "Halifax, New Brunswick",
          }, // UTC-4
          { iana: "Atlantic/Bermuda", name: "バミューダ", nameEn: "Bermuda" }, // UTC-4
          {
            iana: "America/St_Johns",
            name: "ニューファンドランド",
            nameEn: "Newfoundland",
          }, // UTC-3:30
          { iana: "America/Nuuk", name: "グリーンランド", nameEn: "Greenland" }, // UTC-2
          {
            iana: "America/Scoresbysund",
            name: "グリーンランド東部",
            nameEn: "Eastern Greenland",
            sub: "イトトコートミート",
            subEn: "Ittoqqortoormiit",
          }, // UTC-1
          {
            iana: "America/Danmarkshavn",
            name: "グリーンランド北東部",
            nameEn: "Northeastern Greenland",
          }, // UTC+0
          {
            iana: "America/Miquelon",
            name: "サンピエール島・ミクロン島",
            nameEn: "Saint Pierre and Miquelon",
          }, // UTC-3
        ],
      },
      {
        label: "カリブ海",
        labelEn: "Caribbean",
        zones: [
          {
            iana: "America/Cayman",
            name: "ケイマン諸島",
            nameEn: "Cayman Islands",
          }, // UTC-5
          { iana: "America/Jamaica", name: "ジャマイカ", nameEn: "Jamaica" }, // UTC-5
          { iana: "America/Nassau", name: "バハマ", nameEn: "Bahamas" }, // UTC-5
          { iana: "America/Port-au-Prince", name: "ハイチ", nameEn: "Haiti" }, // UTC-5
          {
            iana: "America/Grand_Turk",
            name: "タークス・カイコス諸島",
            nameEn: "Turks and Caicos Islands",
          }, // UTC-5
          { iana: "America/Havana", name: "キューバ", nameEn: "Cuba" }, // UTC-5
          { iana: "America/Anguilla", name: "アンギラ", nameEn: "Anguilla" }, // UTC-4
          {
            iana: "America/Antigua",
            name: "アンティグア・バーブーダ",
            nameEn: "Antigua and Barbuda",
          }, // UTC-4
          { iana: "America/Aruba", name: "アルバ", nameEn: "Aruba" }, // UTC-4
          { iana: "America/Barbados", name: "バルバドス", nameEn: "Barbados" }, // UTC-4
          {
            iana: "America/St_Barthelemy",
            name: "サン・バルテルミー",
            nameEn: "Saint Barthélemy",
          }, // UTC-4
          {
            iana: "America/Kralendijk",
            name: "カリブ海オランダ",
            nameEn: "Caribbean Netherlands",
            sub: "ボネール・サバ・シント・ユースタティウス",
            subEn: "Bonaire, Saba, Sint Eustatius",
          }, // UTC-4
          { iana: "America/Curacao", name: "キュラソー", nameEn: "Curaçao" }, // UTC-4
          { iana: "America/Dominica", name: "ドミニカ国", nameEn: "Dominica" }, // UTC-4
          {
            iana: "America/Santo_Domingo",
            name: "ドミニカ共和国",
            nameEn: "Dominican Republic",
          }, // UTC-4
          { iana: "America/Grenada", name: "グレナダ", nameEn: "Grenada" }, // UTC-4
          {
            iana: "America/Guadeloupe",
            name: "グアドループ",
            nameEn: "Guadeloupe",
          }, // UTC-4
          {
            iana: "America/Martinique",
            name: "マルティニーク",
            nameEn: "Martinique",
          }, // UTC-4
          {
            iana: "America/Marigot",
            name: "サン・マルタン",
            nameEn: "Saint Martin",
          }, // UTC-4
          {
            iana: "America/Montserrat",
            name: "モントセラト",
            nameEn: "Montserrat",
          }, // UTC-4
          {
            iana: "America/Puerto_Rico",
            name: "プエルトリコ",
            nameEn: "Puerto Rico",
          }, // UTC-4
          {
            iana: "America/St_Kitts",
            name: "セントクリストファー・ネビス",
            nameEn: "Saint Kitts and Nevis",
          }, // UTC-4
          {
            iana: "America/St_Lucia",
            name: "セントルシア",
            nameEn: "Saint Lucia",
          }, // UTC-4
          {
            iana: "America/Lower_Princes",
            name: "シント・マールテン",
            nameEn: "Sint Maarten",
          }, // UTC-4
          {
            iana: "America/Port_of_Spain",
            name: "トリニダード・トバゴ",
            nameEn: "Trinidad and Tobago",
          }, // UTC-4
          {
            iana: "America/St_Thomas",
            name: "米領ヴァージン諸島",
            nameEn: "U.S. Virgin Islands",
          }, // UTC-4
          {
            iana: "America/Tortola",
            name: "英領ヴァージン諸島",
            nameEn: "British Virgin Islands",
          }, // UTC-4
          {
            iana: "America/St_Vincent",
            name: "セントビンセント・グレナディーン",
            nameEn: "Saint Vincent and the Grenadines",
          }, // UTC-4
        ],
      },
      {
        label: "南米",
        labelEn: "South America",
        zones: [
          { iana: "America/Guayaquil", name: "エクアドル", nameEn: "Ecuador" }, // UTC-5
          { iana: "America/Lima", name: "ペルー", nameEn: "Peru" }, // UTC-5
          { iana: "America/Bogota", name: "コロンビア", nameEn: "Colombia" }, // UTC-5
          {
            iana: "Pacific/Easter",
            name: "イースター島",
            nameEn: "Easter Island",
          }, // UTC-6/DST (チリ領)
          {
            iana: "Pacific/Galapagos",
            name: "ガラパゴス諸島",
            nameEn: "Galápagos Islands",
          }, // UTC-6 (エクアドル領)
          { iana: "America/Caracas", name: "ベネズエラ", nameEn: "Venezuela" }, // UTC-4
          { iana: "America/La_Paz", name: "ボリビア", nameEn: "Bolivia" }, // UTC-4
          { iana: "America/Guyana", name: "ガイアナ", nameEn: "Guyana" }, // UTC-4
          {
            iana: "America/Manaus",
            name: "ブラジル・アマゾン",
            nameEn: "Brazil – Amazon",
            sub: "マナウス",
            subEn: "Manaus",
          }, // UTC-4
          { iana: "America/Asuncion", name: "パラグアイ", nameEn: "Paraguay" }, // UTC-4
          { iana: "America/Santiago", name: "チリ", nameEn: "Chile" }, // UTC-3
          {
            iana: "America/Argentina/Buenos_Aires",
            name: "アルゼンチン",
            nameEn: "Argentina",
          }, // UTC-3 (統合)
          {
            iana: "America/Sao_Paulo",
            name: "ブラジル",
            nameEn: "Brazil",
            sub: "サンパウロ・リオデジャネイロ・ブラジリア",
            subEn: "São Paulo, Rio de Janeiro, Brasília",
          }, // UTC-3
          {
            iana: "America/Cayenne",
            name: "フランス領ギアナ",
            nameEn: "French Guiana",
          }, // UTC-3
          { iana: "America/Paramaribo", name: "スリナム", nameEn: "Suriname" }, // UTC-3
          { iana: "America/Montevideo", name: "ウルグアイ", nameEn: "Uruguay" }, // UTC-3
          {
            iana: "Atlantic/Stanley",
            name: "フォークランド諸島",
            nameEn: "Falkland Islands",
          }, // UTC-3
          {
            iana: "America/Noronha",
            name: "フェルナンド・デ・ノローニャ島",
            nameEn: "Fernando de Noronha",
          }, // UTC-2
        ],
      },
    ],
  },
  {
    label: "アフリカ",
    labelEn: "Africa",
    subGroups: [
      {
        label: "北アフリカ",
        labelEn: "Northern Africa",
        zones: [
          {
            iana: "Atlantic/Cape_Verde",
            name: "カーボベルデ",
            nameEn: "Cape Verde",
          }, // UTC-1
          { iana: "Africa/Casablanca", name: "モロッコ", nameEn: "Morocco" }, // UTC+1
          {
            iana: "Africa/El_Aaiun",
            name: "西サハラ",
            nameEn: "Western Sahara",
          }, // UTC+1
          { iana: "Africa/Algiers", name: "アルジェリア", nameEn: "Algeria" }, // UTC+1
          { iana: "Africa/Tunis", name: "チュニジア", nameEn: "Tunisia" }, // UTC+1
          { iana: "Africa/Cairo", name: "エジプト", nameEn: "Egypt" }, // UTC+2
          { iana: "Africa/Tripoli", name: "リビア", nameEn: "Libya" }, // UTC+2
          { iana: "Africa/Khartoum", name: "スーダン", nameEn: "Sudan" }, // UTC+3
        ],
      },
      {
        label: "西アフリカ",
        labelEn: "Western Africa",
        zones: [
          {
            iana: "Africa/Abidjan",
            name: "コートジボワール",
            nameEn: "Côte d'Ivoire",
          }, // UTC+0
          { iana: "Africa/Accra", name: "ガーナ", nameEn: "Ghana" }, // UTC+0
          { iana: "Africa/Banjul", name: "ガンビア", nameEn: "Gambia" }, // UTC+0
          { iana: "Africa/Conakry", name: "ギニア", nameEn: "Guinea" }, // UTC+0
          {
            iana: "Africa/Bissau",
            name: "ギニアビサウ",
            nameEn: "Guinea-Bissau",
          }, // UTC+0
          {
            iana: "Africa/Freetown",
            name: "シエラレオネ",
            nameEn: "Sierra Leone",
          }, // UTC+0
          { iana: "Africa/Dakar", name: "セネガル", nameEn: "Senegal" }, // UTC+0
          { iana: "Africa/Lome", name: "トーゴ", nameEn: "Togo" }, // UTC+0
          { iana: "Africa/Bamako", name: "マリ", nameEn: "Mali" }, // UTC+0
          { iana: "Africa/Monrovia", name: "リベリア", nameEn: "Liberia" }, // UTC+0
          {
            iana: "Atlantic/St_Helena",
            name: "セントヘレナ",
            nameEn: "Saint Helena",
          }, // UTC+0
          {
            iana: "Africa/Nouakchott",
            name: "モーリタニア",
            nameEn: "Mauritania",
          }, // UTC+0
          {
            iana: "Africa/Ouagadougou",
            name: "ブルキナファソ",
            nameEn: "Burkina Faso",
          }, // UTC+0
          { iana: "Africa/Niamey", name: "ニジェール", nameEn: "Niger" }, // UTC+1
          { iana: "Africa/Lagos", name: "ナイジェリア", nameEn: "Nigeria" }, // UTC+1
          { iana: "Africa/Porto-Novo", name: "ベナン", nameEn: "Benin" }, // UTC+1
        ],
      },
      {
        label: "中部アフリカ",
        labelEn: "Middle Africa",
        zones: [
          {
            iana: "Africa/Sao_Tome",
            name: "サントメ・プリンシペ",
            nameEn: "São Tomé and Príncipe",
          }, // UTC+0
          {
            iana: "Africa/Bangui",
            name: "中央アフリカ共和国",
            nameEn: "Central African Republic",
          }, // UTC+1
          { iana: "Africa/Douala", name: "カメルーン", nameEn: "Cameroon" }, // UTC+1
          { iana: "Africa/Libreville", name: "ガボン", nameEn: "Gabon" }, // UTC+1
          {
            iana: "Africa/Brazzaville",
            name: "コンゴ共和国",
            nameEn: "Republic of the Congo",
          }, // UTC+1
          {
            iana: "Africa/Kinshasa",
            name: "コンゴ民主共和国西部",
            nameEn: "Western DR Congo",
            sub: "キンシャサ",
            subEn: "Kinshasa",
          }, // UTC+1
          {
            iana: "Africa/Malabo",
            name: "赤道ギニア",
            nameEn: "Equatorial Guinea",
          }, // UTC+1
          { iana: "Africa/Ndjamena", name: "チャド", nameEn: "Chad" }, // UTC+1
          { iana: "Africa/Luanda", name: "アンゴラ", nameEn: "Angola" }, // UTC+1
          {
            iana: "Africa/Lubumbashi",
            name: "コンゴ民主共和国東部",
            nameEn: "Eastern DR Congo",
            sub: "ルブンバシ",
            subEn: "Lubumbashi",
          }, // UTC+2
        ],
      },
      {
        label: "東アフリカ",
        labelEn: "Eastern Africa",
        zones: [
          { iana: "Africa/Blantyre", name: "マラウイ", nameEn: "Malawi" }, // UTC+2
          { iana: "Africa/Maputo", name: "モザンビーク", nameEn: "Mozambique" }, // UTC+2
          { iana: "Africa/Kigali", name: "ルワンダ", nameEn: "Rwanda" }, // UTC+2
          { iana: "Africa/Bujumbura", name: "ブルンジ", nameEn: "Burundi" }, // UTC+2
          { iana: "Africa/Lusaka", name: "ザンビア", nameEn: "Zambia" }, // UTC+2
          { iana: "Africa/Harare", name: "ジンバブエ", nameEn: "Zimbabwe" }, // UTC+2
          {
            iana: "Africa/Addis_Ababa",
            name: "エチオピア",
            nameEn: "Ethiopia",
          }, // UTC+3
          { iana: "Africa/Asmara", name: "エリトリア", nameEn: "Eritrea" }, // UTC+3
          {
            iana: "Africa/Dar_es_Salaam",
            name: "タンザニア",
            nameEn: "Tanzania",
          }, // UTC+3
          { iana: "Africa/Djibouti", name: "ジブチ", nameEn: "Djibouti" }, // UTC+3
          { iana: "Africa/Juba", name: "南スーダン", nameEn: "South Sudan" }, // UTC+3
          { iana: "Africa/Kampala", name: "ウガンダ", nameEn: "Uganda" }, // UTC+3
          { iana: "Africa/Mogadishu", name: "ソマリア", nameEn: "Somalia" }, // UTC+3
          { iana: "Africa/Nairobi", name: "ケニア", nameEn: "Kenya" }, // UTC+3
          {
            iana: "Indian/Antananarivo",
            name: "マダガスカル",
            nameEn: "Madagascar",
          }, // UTC+3
          { iana: "Indian/Comoro", name: "コモロ", nameEn: "Comoros" }, // UTC+3
          { iana: "Indian/Mayotte", name: "マイヨット", nameEn: "Mayotte" }, // UTC+3
          {
            iana: "Indian/Mauritius",
            name: "モーリシャス",
            nameEn: "Mauritius",
          }, // UTC+4
          { iana: "Indian/Reunion", name: "レユニオン", nameEn: "Réunion" }, // UTC+4
          { iana: "Indian/Mahe", name: "セーシェル", nameEn: "Seychelles" }, // UTC+4
        ],
      },
      {
        label: "南部アフリカ",
        labelEn: "Southern Africa",
        zones: [
          { iana: "Africa/Gaborone", name: "ボツワナ", nameEn: "Botswana" }, // UTC+2
          { iana: "Africa/Maseru", name: "レソト", nameEn: "Lesotho" }, // UTC+2
          { iana: "Africa/Windhoek", name: "ナミビア", nameEn: "Namibia" }, // UTC+2
          { iana: "Africa/Mbabane", name: "エスワティニ", nameEn: "Eswatini" }, // UTC+2
          {
            iana: "Africa/Johannesburg",
            name: "南アフリカ",
            nameEn: "South Africa",
          }, // UTC+2
        ],
      },
    ],
  },
];

const ALL_TZ_MAP = new Map(
  TZ_GROUPS.flatMap((g) =>
    g.subGroups.flatMap((sg) => sg.zones.map((z) => [z.iana, z] as const)),
  ),
);

function cityOf(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

/** ja 以外は英語。収録している言語は日英だけなので、その2択に畳む。 */
export function isEnglish(locale: string | undefined): boolean {
  return (locale ?? "ja").split("-")[0] !== "ja";
}

/** ゾーンの表示名（収録外は末尾の都市名で代替）。 */
export function tzDisplayLabel(iana: string, locale?: string): string {
  const z = ALL_TZ_MAP.get(iana);
  if (!z) return cityOf(iana);
  return isEnglish(locale) ? z.nameEn : z.name;
}

/** ゾーンの2行目（代表都市など）。持たないゾーンは undefined。 */
export function tzDisplaySub(
  z: TzZone,
  locale?: string,
): string | undefined {
  return isEnglish(locale) ? z.subEn : z.sub;
}

/** グループ・サブ地域の見出し。 */
export function tzGroupLabel(
  g: { label: string; labelEn: string },
  locale?: string,
): string {
  return isEnglish(locale) ? g.labelEn : g.label;
}
