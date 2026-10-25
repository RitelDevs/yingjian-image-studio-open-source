// Public display metadata; complete rules stay on the server.
// inputMode: prompt = describe content; reference = upload a photo, no prompt required.
const catalog = [
  {
    "id": "clay-avatar",
    "version": "2.0.0",
    "name": "黏土头像",
    "category": "人像",
    "description": "圆润黏土体块、手作指纹与定格动画般的微缩布景。",
    "tags": [
      "手作黏土",
      "柔和布光",
      "头像"
    ],
    "cover": {
      "variant": "clay-avatar",
      "colors": [
        "#EAE4F5",
        "#9C87BD",
        "#D3A578"
      ]
    },
    "subjectPlaceholder": "例如：戴圆框眼镜、穿绿色毛衣的短发女孩",
    "example": {
      "subject": "戴圆框眼镜、穿绿色毛衣的短发女孩，微笑看向镜头",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "1:1",
      "count": 1
    },
    "inputMode": "prompt"
  },
  {
    "id": "product-studio",
    "version": "2.0.0",
    "name": "商业产品摄影",
    "category": "产品",
    "description": "单一硬闪、明确背景色与清楚的产品结构，适合商品主图。",
    "tags": [
      "硬闪棚拍",
      "真实材质",
      "产品主图"
    ],
    "cover": {
      "variant": "product-studio",
      "colors": [
        "#DCE9F1",
        "#3F7FA8",
        "#182D40"
      ]
    },
    "subjectPlaceholder": "例如：一支高端电影镜头，黑色金属镜身与蓝紫镀膜，深灰背景",
    "example": {
      "subject": "一支高端全画幅电影定焦镜头，独立产品英雄照，不带相机机身。镜身采用哑光黑色阳极氧化金属，精密齿轮式对焦环与光圈环、少量细白刻度、克制的钛银色金属细节；大口径前组镜片呈现深邃的蓝紫与青绿色光学镀膜反射。镜头以自然的三分之四视角斜放在深石墨灰摄影台面上，前镜片朝向镜头右前方，完整展示镜片与镜筒结构；单一有方向的棚拍主光，窄而干净的边缘高光，真实接触阴影，黑色表面仍有丰富明暗层次。深石墨灰无缝背景，产品居中偏下，占画面约七成，四周适量留白，昂贵精密光学器材的广告质感。不要品牌标志、额外标题、包装、道具、爆炸拆解或虚构发光结构。",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "4:3",
      "count": 1
    },
    "inputMode": "prompt"
  },
  {
    "id": "retro-poster",
    "version": "2.0.0",
    "name": "复古广告海报",
    "category": "海报",
    "description": "粗黑网格、平面色块与醒目的复古波普标题。",
    "tags": [
      "粗线网格",
      "复古波普",
      "广告"
    ],
    "cover": {
      "variant": "retro-poster",
      "colors": [
        "#F5F0E6",
        "#D9A441",
        "#000000"
      ]
    },
    "subjectPlaceholder": "例如：一杯冰拿铁，放在窗边木桌上",
    "example": {
      "subject": "一杯冰拿铁，放在窗边木桌上",
      "title": "周末放空"
    },
    "supportsTitle": true,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:4",
      "count": 1
    },
    "inputMode": "prompt"
  },
  {
    "id": "picture-book",
    "version": "2.0.0",
    "name": "温暖绘本",
    "category": "插画",
    "description": "淡彩渗色、细线与水彩纸纹理，在留白中呈现温暖故事。",
    "tags": [
      "水彩",
      "纸张纹理",
      "故事场景"
    ],
    "cover": {
      "variant": "picture-book",
      "colors": [
        "#F3E8D6",
        "#94B59C",
        "#D99065"
      ]
    },
    "subjectPlaceholder": "例如：一只小狐狸提着灯，走过雨后的森林",
    "example": {
      "subject": "一只小狐狸提着小灯，走过雨后的森林，停下来看一朵蘑菇",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "4:3",
      "count": 1
    },
    "inputMode": "prompt"
  },
  {
    "id": "paper-cut",
    "version": "2.0.0",
    "name": "层叠剪纸",
    "category": "插画",
    "description": "用撕边、纸纹和层间投影组成富有手作感的剪纸画面。",
    "tags": [
      "纸艺",
      "层次",
      "手工边缘"
    ],
    "cover": {
      "variant": "paper-cut",
      "colors": [
        "#FFF8F0",
        "#76A992",
        "#EAA18E"
      ]
    },
    "subjectPlaceholder": "例如：两只白鹭站在芦苇与荷叶之间",
    "example": {
      "subject": "两只白鹭站在芦苇与荷叶之间，远处是一轮低低的太阳",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "1:1",
      "count": 1
    },
    "inputMode": "prompt"
  },
  {
    "id": "film-photo",
    "version": "2.0.0",
    "name": "胶片生活摄影",
    "category": "摄影",
    "description": "真实环境光、低饱和暖色与连续胶片颗粒，记录日常片刻。",
    "tags": [
      "环境实用光",
      "胶片颗粒",
      "日常记录"
    ],
    "cover": {
      "variant": "film-photo",
      "colors": [
        "#E8DDD0",
        "#6A7D73",
        "#BF805D"
      ]
    },
    "subjectPlaceholder": "例如：雨后的街角，骑自行车的人经过一家花店",
    "example": {
      "subject": "雨后的街角，穿浅色外套的人骑自行车经过一家花店",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:2",
      "count": 1
    },
    "inputMode": "prompt"
  },
  {
    "id": "minimal-poster",
    "version": "2.0.0",
    "name": "极简文字海报",
    "category": "海报",
    "description": "纯白背景、宽边距、单一强调色与简洁字形。",
    "tags": [
      "留白",
      "文字排版",
      "几何构成"
    ],
    "cover": {
      "variant": "minimal-poster",
      "colors": [
        "#FFFFFF",
        "#1A1A1A",
        "#2563EB"
      ]
    },
    "subjectPlaceholder": "例如：一把蓝色椅子与它在地面上的长影子",
    "example": {
      "subject": "一把蓝色椅子与它在地面上的长影子",
      "title": "留一点空白"
    },
    "supportsTitle": true,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:4",
      "count": 1
    },
    "inputMode": "prompt"
  },
  {
    "id": "isometric-scene",
    "version": "2.0.0",
    "name": "等距微缩场景",
    "category": "插画",
    "description": "30° 等距体块、清楚填色与统一线宽，呈现空间关系。",
    "tags": [
      "30°等距",
      "微缩场景",
      "几何构成"
    ],
    "cover": {
      "variant": "isometric-scene",
      "colors": [
        "#F0F4F8",
        "#2563EB",
        "#F59E0B"
      ]
    },
    "subjectPlaceholder": "例如：一间带书架、绿植和落地窗的咖啡馆",
    "example": {
      "subject": "一间带书架、绿植和落地窗的咖啡馆，保留吧台与两张小圆桌",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "1:1",
      "count": 1
    },
    "inputMode": "prompt"
  },
  {
    "id": "shinkai-scene",
    "version": "1.0.0",
    "name": "新海诚光影场景",
    "category": "动漫",
    "inputMode": "prompt",
    "description": "细腻天空、真实建筑与通透光影，描绘日系动画中的日常场景。",
    "tags": [
      "新海诚",
      "日系动画",
      "光影"
    ],
    "cover": {
      "variant": "shinkai-scene",
      "colors": [
        "#C5EAF8",
        "#F2A78E",
        "#326AAC"
      ]
    },
    "subjectPlaceholder": "例如：雨后的小城街道，一名背着书包的女生经过天桥，傍晚云层透出金色阳光。",
    "example": {
      "subject": "雨后的小城街道，一名背着书包的女生经过天桥，傍晚云层透出金色阳光。",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "16:9",
      "count": 1
    }
  },
  {
    "id": "editorial-cover",
    "version": "1.0.0",
    "name": "编辑式杂志封面",
    "category": "海报",
    "inputMode": "prompt",
    "description": "一个清楚的主视觉，配合有层级的标题与克制的留白。",
    "tags": [
      "杂志",
      "封面",
      "排版"
    ],
    "cover": {
      "variant": "editorial-cover",
      "colors": [
        "#F1F0EB",
        "#E65E46",
        "#1F3542"
      ]
    },
    "subjectPlaceholder": "例如：以雨后城市建筑为主题，画面主体是玻璃外墙与一把红伞，主标题放在上方。",
    "example": {
      "subject": "以雨后城市建筑为主题，画面主体是玻璃外墙与一把红伞，主标题放在上方。",
      "title": "城市之后"
    },
    "supportsTitle": true,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:4",
      "count": 1
    }
  },
  {
    "id": "knowledge-card",
    "version": "1.0.0",
    "name": "社交知识卡片",
    "category": "信息图",
    "inputMode": "prompt",
    "description": "把明确的知识要点整理成层级清楚、便于阅读的单张卡片。",
    "tags": [
      "知识卡",
      "清单",
      "社交"
    ],
    "cover": {
      "variant": "knowledge-card",
      "colors": [
        "#FFF3DD",
        "#F3AC47",
        "#4B5C55"
      ]
    },
    "subjectPlaceholder": "例如：请按顺序排成清单：1. 写清主体；2. 说明场景；3. 补充光线；4. 指定画面比例。只使用这些内容。",
    "example": {
      "subject": "请按顺序排成清单：1. 写清主体；2. 说明场景；3. 补充光线；4. 指定画面比例。只使用这些内容。",
      "title": "四步描述画面"
    },
    "supportsTitle": true,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:4",
      "count": 1
    }
  },
  {
    "id": "four-panel-comic",
    "version": "1.0.0",
    "name": "四格故事漫画",
    "category": "漫画",
    "inputMode": "prompt",
    "description": "用四个清楚的情节节点讲故事，保持人物与配饰的一致性。",
    "tags": [
      "四格",
      "分镜",
      "故事"
    ],
    "cover": {
      "variant": "four-panel-comic",
      "colors": [
        "#F7F4E8",
        "#D4856B",
        "#343B41"
      ]
    },
    "subjectPlaceholder": "例如：四格故事：小猫发现纸箱；小猫尝试钻进去；纸箱太小卡住；小猫趴在纸箱上睡着。无对白。",
    "example": {
      "subject": "四格故事：小猫发现纸箱；小猫尝试钻进去；纸箱太小卡住；小猫趴在纸箱上睡着。无对白。",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "1:1",
      "count": 1
    }
  },
  {
    "id": "character-sheet",
    "version": "1.0.0",
    "name": "角色设定表",
    "category": "角色",
    "inputMode": "prompt",
    "description": "在一张画面上核对角色的外形、服装、视图和表情。",
    "tags": [
      "角色",
      "多视图",
      "表情"
    ],
    "cover": {
      "variant": "character-sheet",
      "colors": [
        "#E9ECF1",
        "#9A8FC0",
        "#3B485D"
      ]
    },
    "subjectPlaceholder": "例如：短发、圆框眼镜、绿色夹克的角色；展示正面、侧面、背面三个站姿，标签原文为“正面”“侧面”“背面”。",
    "example": {
      "subject": "短发、圆框眼镜、绿色夹克的角色；展示正面、侧面、背面三个站姿，标签原文为“正面”“侧面”“背面”。",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "4:3",
      "count": 1
    }
  },
  {
    "id": "travel-poster",
    "version": "1.0.0",
    "name": "旅行目的地海报",
    "category": "海报",
    "inputMode": "prompt",
    "description": "用景观与清楚的标题组织旅行印象，保留地方特征。",
    "tags": [
      "旅行",
      "景观",
      "海报"
    ],
    "cover": {
      "variant": "travel-poster",
      "colors": [
        "#F6EAD3",
        "#52A6AA",
        "#375C5E"
      ]
    },
    "subjectPlaceholder": "例如：云南大理洱海边的白色建筑和远山，以湖水与山体构成主视觉，不添加其他地标。",
    "example": {
      "subject": "云南大理洱海边的白色建筑和远山，以湖水与山体构成主视觉，不添加其他地标。",
      "title": "去看山海"
    },
    "supportsTitle": true,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:4",
      "count": 1
    }
  },
  {
    "id": "packaging-concept",
    "version": "1.0.0",
    "name": "新品包装概念",
    "category": "产品",
    "inputMode": "prompt",
    "description": "以真实包装结构和材质为基础，探索主展示面的图文关系。",
    "tags": [
      "包装",
      "材质",
      "品牌概念"
    ],
    "cover": {
      "variant": "packaging-concept",
      "colors": [
        "#EEE8DF",
        "#AD724C",
        "#394C51"
      ]
    },
    "subjectPlaceholder": "例如：一只浅绿色茶叶纸盒，正面只写“山间”，侧面留白，保留盒盖开口结构。",
    "example": {
      "subject": "一只浅绿色茶叶纸盒，正面只写“山间”，侧面留白，保留盒盖开口结构。",
      "title": "山间"
    },
    "supportsTitle": true,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "4:3",
      "count": 1
    }
  },
  {
    "id": "scientific-schematic",
    "version": "1.0.0",
    "name": "科研机制示意图",
    "category": "科研",
    "inputMode": "prompt",
    "description": "按提供的组件、标签和箭头关系绘制科研或系统示意草图。",
    "tags": [
      "科研",
      "机制图",
      "系统关系"
    ],
    "cover": {
      "variant": "scientific-schematic",
      "colors": [
        "#F5F8FC",
        "#3A8E9D",
        "#253A52"
      ]
    },
    "subjectPlaceholder": "例如：从左到右：温湿度传感器 → ESP32 → 本地规则判断 → 风扇；风扇运行状态返回 ESP32。只使用这些节点和连接。",
    "example": {
      "subject": "从左到右：温湿度传感器 → ESP32 → 本地规则判断 → 风扇；风扇运行状态返回 ESP32。只使用这些节点和连接。",
      "title": "本地控制流程"
    },
    "supportsTitle": true,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "16:9",
      "count": 1
    }
  },
  {
    "id": "photo-anime",
    "version": "1.0.0",
    "name": "照片转新海诚风格",
    "category": "动漫",
    "inputMode": "reference",
    "description": "上传一张照片，保留人物和场景，将表现转换为日系动画光影。",
    "tags": [
      "新海诚",
      "照片动漫化",
      "上传套用"
    ],
    "cover": {
      "variant": "photo-anime",
      "colors": [
        "#CEEAF4",
        "#EEA08B",
        "#3F76AC"
      ]
    },
    "subjectPlaceholder": "上传参考图即可，不需要填写提示词",
    "example": {
      "subject": "",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:2",
      "count": 1
    }
  },
  {
    "id": "photo-clay-avatar",
    "version": "1.0.0",
    "name": "照片变黏土头像",
    "category": "人像",
    "inputMode": "reference",
    "description": "上传人物或宠物照片，保留辨识特征，转换为手作黏土头像。",
    "tags": [
      "黏土",
      "参考图",
      "上传套用"
    ],
    "cover": {
      "variant": "photo-clay-avatar",
      "colors": [
        "#EEE3F4",
        "#AA8FBC",
        "#C09B7C"
      ]
    },
    "subjectPlaceholder": "上传参考图即可，不需要填写提示词",
    "example": {
      "subject": "",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "1:1",
      "count": 1
    }
  },
  {
    "id": "product-white",
    "version": "1.0.0",
    "name": "产品白底棚拍",
    "category": "产品",
    "inputMode": "reference",
    "description": "上传产品图，清理为白色背景，保留产品结构和已有标识。",
    "tags": [
      "白底",
      "商品主图",
      "上传套用"
    ],
    "cover": {
      "variant": "product-white",
      "colors": [
        "#F6F7F8",
        "#D0DBE2",
        "#657B87"
      ]
    },
    "subjectPlaceholder": "上传参考图即可，不需要填写提示词",
    "example": {
      "subject": "",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "4:3",
      "count": 1
    }
  },
  {
    "id": "product-lifestyle",
    "version": "1.0.0",
    "name": "产品窗边生活照",
    "category": "产品",
    "inputMode": "reference",
    "description": "上传产品图，将产品放入自然光窗边台面的生活场景。",
    "tags": [
      "窗边",
      "自然光",
      "上传套用"
    ],
    "cover": {
      "variant": "product-lifestyle",
      "colors": [
        "#EFE7DB",
        "#B88D65",
        "#5F7266"
      ]
    },
    "subjectPlaceholder": "上传参考图即可，不需要填写提示词",
    "example": {
      "subject": "",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "4:3",
      "count": 1
    }
  },
  {
    "id": "photo-watercolor",
    "version": "1.0.0",
    "name": "照片转水彩",
    "category": "插画",
    "inputMode": "reference",
    "description": "保留照片主体与构图，用淡彩、笔触和纸张纹理重绘。",
    "tags": [
      "水彩",
      "照片转换",
      "上传套用"
    ],
    "cover": {
      "variant": "photo-watercolor",
      "colors": [
        "#F3ECDE",
        "#7FA898",
        "#A28270"
      ]
    },
    "subjectPlaceholder": "上传参考图即可，不需要填写提示词",
    "example": {
      "subject": "",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "4:3",
      "count": 1
    }
  },
  {
    "id": "photo-film",
    "version": "1.0.0",
    "name": "自然胶片调色",
    "category": "摄影",
    "inputMode": "reference",
    "description": "只调整照片的色彩、影调和颗粒，保留原来的构图与内容。",
    "tags": [
      "胶片",
      "调色",
      "上传套用"
    ],
    "cover": {
      "variant": "photo-film",
      "colors": [
        "#DFD5C3",
        "#8D8D67",
        "#5C6157"
      ]
    },
    "subjectPlaceholder": "上传参考图即可，不需要填写提示词",
    "example": {
      "subject": "",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:2",
      "count": 1
    }
  },
  {
    "id": "pet-felt",
    "version": "1.0.0",
    "name": "宠物毛毡化",
    "category": "宠物",
    "inputMode": "reference",
    "description": "保留宠物的耳形、毛色与姿态，转换为有纤维质感的毛毡小像。",
    "tags": [
      "宠物",
      "羊毛毡",
      "上传套用"
    ],
    "cover": {
      "variant": "pet-felt",
      "colors": [
        "#EEE6D7",
        "#C7A17D",
        "#64634D"
      ]
    },
    "subjectPlaceholder": "上传参考图即可，不需要填写提示词",
    "example": {
      "subject": "",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "1:1",
      "count": 1
    }
  },
  {
    "id": "photo-restoration",
    "version": "1.0.0",
    "name": "旧照保守修复",
    "category": "摄影",
    "inputMode": "reference",
    "description": "清理灰尘与划痕，保留原照片的身份、年代感和黑白属性。",
    "tags": [
      "旧照",
      "清理",
      "上传套用"
    ],
    "cover": {
      "variant": "photo-restoration",
      "colors": [
        "#E0D8CA",
        "#A99D88",
        "#585B59"
      ]
    },
    "subjectPlaceholder": "上传参考图即可，不需要填写提示词",
    "example": {
      "subject": "",
      "title": ""
    },
    "supportsTitle": false,
    "defaultSettings": {
      "size": "2K",
      "aspectRatio": "3:2",
      "count": 1
    }
  }
];

export const STYLE_CATALOG = Object.freeze(catalog.map(style => Object.freeze({
  ...style, tags: Object.freeze(style.tags),
  cover: Object.freeze({ ...style.cover, colors: Object.freeze(style.cover.colors) }),
  example: Object.freeze(style.example), defaultSettings: Object.freeze(style.defaultSettings)
})));
