// Generates 150 demo products for 3 shops. Run: node scripts/generate_demo_catalog_2026.mjs
import { writeFileSync, mkdirSync } from 'fs';

const OUT = 'demo_catalog_2026';
mkdirSync(`${OUT}/shops`, { recursive: true });

// ── Product builder ──
let seq = 1;
function make(shop, p) {
  const sku = `${shop}-${String(seq++).padStart(3,'0')}`;
  return {
    sku, slug: sku, shopSlug: shop,
    name: p[0], brand: p[1], category: p[2]||'electronics', productType: p[3],
    price: p[4], oldPrice: p[5]||null, description: p[6], benefits: p[7],
    color: p[8]||'', deliveryTerm: '2-5 days', condition: 'new',
    ratingAvg: p[9]||4.5, popularityScore: p[10]||80, searchKeywords: p[11],
    images: [`/demo-products/${shop}/${sku}-1.jpg`,`/demo-products/${shop}/${sku}-2.jpg`,`/demo-products/${shop}/${sku}-3.jpg`],
    isActive: true, demoCatalog: true,
  };
}

// ═══ TECHNOMARKET — Apple only (50 items) ═══
// name, brand, category, productType, price, oldPrice, description, benefits, color, ratingAvg, popularityScore, searchKeywords
const tnData = [
['iPhone 16 Pro Max 256GB','Apple','electronics','phone',169990,0,'Flagship smartphone with titanium body A18 Pro and 48MP camera.','Titanium body|A18 Pro chip|48MP camera','Titan',4.8,95,'iphone 16 pro max apple phone smartphone titanium camera'],
['iPhone 16 Pro 128GB','Apple','electronics','phone',134990,0,'Powerful smartphone in titanium body pro camera Always-On 120Hz.','Always-On 120Hz|Titanium body|A18 Pro','Titan',4.8,93,'iphone 16 pro apple titanium camera ios'],
['iPhone 16 256GB','Apple','electronics','phone',99990,0,'Modern smartphone with Dynamic Island USB-C bright OLED.','Dynamic Island|USB-C|A18 chip','Black',4.7,90,'iphone 16 apple dynamic island usb-c smartphone'],
['iPhone 16 128GB','Apple','electronics','phone',79990,0,'Entry-level iPhone 16 with A18 chip and Face ID.','A18 chip|USB-C|Face ID','White',4.7,88,'iphone 16 apple affordable smartphone face id'],
['iPhone 16 Plus 128GB','Apple','electronics','phone',89990,0,'Large iPhone 16 with 6.7 display and big battery.','6.7 display|A18 chip|Long battery','Blue',4.7,88,'iphone 16 plus apple large display battery'],
['iPhone 15 Pro Max 512GB','Apple','electronics','phone',139990,159990,'Last year flagship A17 Pro titanium USB-C great camera.','A17 Pro|Titanium body|USB-C','Dark Titan',4.8,92,'iphone 15 pro max apple titanium last year camera'],
['iPhone 15 Pro 256GB','Apple','electronics','phone',119990,134990,'Compact Pro with A17 Pro titanium ProMotion 120Hz.','Compact|A17 Pro|ProMotion 120Hz','Silver',4.7,90,'iphone 15 pro apple compact titanium camera'],
['iPhone 15 256GB','Apple','electronics','phone',84990,0,'Smartphone with Dynamic Island bright camera 48MP A16.','Dynamic Island|48MP camera|A16 Bionic','Blue',4.7,87,'iphone 15 apple dynamic island camera a16'],
['iPhone 15 128GB','Apple','electronics','phone',69990,0,'Affordable iPhone 15 with Dynamic Island and USB-C.','Affordable|USB-C|Dynamic Island','Pink',4.6,85,'iphone 15 affordable apple pink usb-c'],
['iPhone 14 256GB','Apple','electronics','phone',69990,79990,'Reliable smartphone with A15 Bionic ceramic shield.','Ceramic shield|A15 Bionic|OLED','Black',4.6,82,'iphone 14 apple ceramic reliable phone'],
['iPhone 14 128GB','Apple','electronics','phone',59990,0,'Good smartphone for daily tasks and communication.','Reliable|Quality camera|Face ID','Red',4.6,80,'iphone 14 red apple daily phone budget'],
['iPhone SE 2025 128GB','Apple','electronics','phone',49990,0,'Compact iPhone with A18 chip and Touch ID.','Compact|Touch ID|A18 chip','Black',4.5,78,'iphone se 2025 compact touch id apple'],
['iPhone SE 2025 256GB','Apple','electronics','phone',59990,0,'More storage in compact iPhone SE with A18.','256GB storage|Touch ID|A18 chip','White',4.5,77,'iphone se 2025 256gb storage compact apple'],
['iPhone 16 Pro Max 1TB','Apple','electronics','phone',189990,0,'Max configuration flagship 1TB ProRes video recording.','1TB storage|ProRes video|Titanium','Titan',4.9,96,'iphone 16 pro max 1tb max prores apple'],

['MacBook Air 13 M4 16/256','Apple','electronics','laptop',109990,0,'Ultra-light laptop M4 chip 16GB fanless design.','Fanless|M4 chip|All-day battery','Space Gray',4.7,92,'macbook air m4 light laptop apple silence'],
['MacBook Air 13 M4 24/512','Apple','electronics','laptop',139990,0,'24GB RAM 512GB SSD for multitasking.','24GB RAM|SSD 512GB|Thin body','Silver',4.7,90,'macbook air m4 24gb 512gb apple laptop'],
['MacBook Air 15 M4 16/512','Apple','electronics','laptop',149990,0,'Large 15-inch Air with M4 great screen.','15 display|M4 chip|6 speakers','Space Gray',4.7,89,'macbook air 15 large screen laptop apple'],
['MacBook Pro 14 M4 Pro 18/512','Apple','electronics','laptop',199990,0,'Professional laptop M4 Pro 18GB mini-LED.','M4 Pro chip|mini-LED|18GB RAM','Space Gray',4.8,93,'macbook pro 14 m4 pro professional apple mini-led'],
['MacBook Pro 14 M4 Pro 36/1TB','Apple','electronics','laptop',269990,0,'Boosted 36GB RAM 1TB SSD for video editing.','36GB RAM|SSD 1TB|XDR display','Silver',4.8,94,'macbook pro 14 36gb 1tb video editing apple'],
['MacBook Pro 16 M4 Max 36/1TB','Apple','electronics','laptop',329990,0,'Most powerful MacBook M4 Max 36GB graphics video.','M4 Max|36GB RAM|XDR 16','Space Gray',4.9,96,'macbook pro 16 m4 max powerful graphics apple'],
['MacBook Pro 16 M4 Max 48/2TB','Apple','electronics','laptop',399990,0,'Top spec 48GB RAM 2TB SSD for professionals.','48GB RAM|SSD 2TB|M4 Max','Silver',4.9,97,'macbook pro 16 48gb 2tb top max apple'],
['MacBook Pro 14 M4 16/512','Apple','electronics','laptop',159990,0,'Base Pro laptop with M4 for developers.','M4 chip|120Hz|16GB','Black',4.7,88,'macbook pro 14 m4 base developer apple'],
['MacBook Air 15 M4 24/512','Apple','electronics','laptop',169990,0,'15-inch Air 24GB for students and creative.','15 display|24GB RAM|Thin','Starlight',4.7,87,'macbook air 15 24gb student creative apple'],
['MacBook Air 13 M4 16/512','Apple','electronics','laptop',129990,0,'Popular Air config 16GB RAM 512GB SSD fast.','Light|SSD 512GB|M4 chip','Starlight',4.7,89,'macbook air 13 popular laptop apple m4'],

['iPad Pro 13 M4 256GB','Apple','electronics','laptop',189990,0,'Tablet with M4 chip Ultra Retina XDR Pencil Pro support.','M4 chip|Ultra Retina XDR|Pencil Pro','Silver',4.8,88,'ipad pro 13 m4 tablet drawing creative apple'],
['iPad Pro 11 M4 256GB','Apple','electronics','laptop',139990,0,'Compact Pro tablet with M4 and Magic Keyboard.','M4 chip|Compact 11|Magic Keyboard','Black',4.8,87,'ipad pro 11 compact tablet keyboard apple'],
['iPad Air 11 M2 128GB','Apple','electronics','laptop',69990,0,'Light universal tablet with M2 for studies.','M2 chip|Light body|Apple Pencil','Blue',4.7,84,'ipad air 11 light studies tablet apple'],
['iPad Air 13 M2 128GB','Apple','electronics','laptop',89990,0,'Large Air with M2 for documents and media.','13 display|M2 chip|Apple Pencil','Starlight',4.7,83,'ipad air 13 large display tablet apple'],
['iPad 11 64GB','Apple','electronics','laptop',39990,0,'Affordable iPad for reading notes simple tasks.','Affordable|Retina display|iPadOS','Yellow',4.6,78,'ipad 11 affordable reading notes tablet apple'],
['iPad 11 256GB','Apple','electronics','laptop',59990,0,'Affordable tablet 256GB for content and games.','256GB storage|Retina|iPadOS','Pink',4.6,77,'ipad 11 256gb storage content tablet apple'],
['iPad mini 8 128GB','Apple','electronics','laptop',59990,0,'Compact 8.3 tablet with A18 for reading.','Compact 8.3|A18 chip|Apple Pencil','Purple',4.6,76,'ipad mini 8 compact reading tablet apple'],
['iPad Pro 13 M4 1TB','Apple','electronics','laptop',249990,0,'Max iPad Pro config for professional creative work.','1TB storage|M4 chip|XDR display','Space Gray',4.9,90,'ipad pro 13 1tb max creative tablet apple'],

['Apple Watch Series 10 GPS 42mm','Apple','electronics','watch',54990,0,'Smartwatch ECG blood oxygen workouts notifications.','ECG|Blood oxygen|WR50','Black',4.7,82,'apple watch series 10 watch ecg health sport apple'],
['Apple Watch Series 10 GPS 46mm','Apple','electronics','watch',59990,0,'Large 46mm body Always-On S10 chip.','46mm display|Always-On|S10 chip','Silver',4.7,81,'apple watch 10 46mm large watch sport apple'],
['Apple Watch Ultra 3 49mm','Apple','electronics','watch',109990,0,'Ultra-durable watch titanium depth gauge dual GPS.','Titanium body|Depth gauge|Dual GPS','Titanium',4.8,85,'apple watch ultra 3 titanium depth diving apple'],
['Apple Watch SE 3 GPS 40mm','Apple','electronics','watch',24990,0,'Affordable smartwatch fitness notifications family setup.','Affordable|Family setup|Fitness','Starlight',4.6,75,'apple watch se affordable watch fitness apple'],
['Apple Watch Ultra 3 49mm LTE','Apple','electronics','watch',119990,0,'Ultra with cellular take calls without phone.','LTE cellular|Titanium|72h battery','Titanium',4.8,86,'apple watch ultra lte calls sport travel apple'],
['Apple Watch SE 3 GPS 44mm','Apple','electronics','watch',28990,0,'Larger SE body great display fitness features.','44mm display|Fitness|S9 chip','Black',4.6,76,'apple watch se 44mm display watch fitness apple'],

['AirPods Pro 3 USB-C','Apple','electronics','headphones',29990,0,'Earbuds with active noise cancellation 2.0 spatial audio.','ANC 2.0|Spatial audio|USB-C','White',4.7,90,'airpods pro 3 earbuds anc wireless audio apple'],
['AirPods 4','Apple','electronics','headphones',16990,0,'Wireless earbuds improved fit H2 chip.','Improved fit|H2 chip|USB-C','White',4.6,88,'airpods 4 earbuds wireless light audio apple'],
['AirPods 4 ANC','Apple','electronics','headphones',22990,0,'AirPods 4 with ANC affordable Pro alternative.','ANC|Adaptive audio|USB-C','White',4.6,87,'airpods 4 anc affordable earbuds apple'],
['AirPods Max USB-C','Apple','electronics','headphones',79990,0,'Over-ear headphones ANC spatial audio premium.','Over-ear cushions|ANC|Spatial audio','Space Gray',4.7,89,'airpods max over-ear anc premium audio apple'],
['AirPods Pro 2 USB-C','Apple','electronics','headphones',24990,29990,'Previous gen Pro great ANC spatial audio.','ANC|Spatial audio|USB-C','White',4.6,85,'airpods pro 2 anc proven choice apple'],

['Apple Pencil Pro','Apple','electronics','tablet',14990,0,'Stylus for iPad haptic feedback magnetic charging.','Haptic feedback|Magnetic charge|Pressure','White',4.5,78,'apple pencil pro stylus tablet drawing ipad apple'],
['Magic Keyboard iPad Pro 13','Apple','electronics','keyboard',44990,0,'Keyboard case with trackpad backlight for iPad Pro.','Trackpad|Backlit keys|USB-C passthrough','Black',4.5,77,'magic keyboard ipad pro trackpad typing apple'],
['Magic Mouse 3','Apple','electronics','keyboard',11990,0,'Wireless mouse multi-touch surface USB-C.','Multi-touch|USB-C|Bluetooth','White',4.5,75,'magic mouse wireless multi-touch bluetooth apple'],
['MagSafe Charger','Apple','electronics','phone',4990,0,'Wireless charger with magnet for precise alignment.','Magnetic snap|Fast charge 15W|USB-C','White',4.5,74,'magsafe charger wireless iphone magnetic apple'],
['USB-C to Lightning Adapter','Apple','electronics','phone',3990,0,'Official adapter for Lightning accessories to new iPhones.','Original|Lightweight|Compatible','White',4.4,72,'adapter usb-c lightning apple charger connector'],
['Studio Display','Apple','electronics','monitor',199990,0,'27-inch 5K monitor with 12MP camera speakers USB-C hub.','5K Retina|12MP camera|USB-C hub','Silver',4.7,80,'studio display 5k monitor mac hub camera apple'],
['Apple USB-C Digital AV Multiport','Apple','electronics','phone',7990,0,'USB-C to HDMI USB-A USB-C adapter for MacBook iPad.','HDMI 4K|USB-A|USB-C passthrough','White',4.4,70,'adapter usb-c hdmi multiport hub apple macbook ipad'],
];

// ═══ GAMEPOWER — gaming/PC (50 items) ═══
const gpData = [
['GameStation Pro ASUS i7 RTX 4070 Ti','ASUS','electronics','laptop',89990,0,'Powerful gaming PC Intel Core i7-14700K RTX 4070 Ti 32GB 1TB SSD.','RTX 4070 Ti|6 fan cooling|VR ready','Black',4.4,80,'gaming pc asus rtx 4070 ti intel computer games'],
['GameStation Pro MSI i9 RTX 4080 Super','MSI','electronics','laptop',109990,0,'Gaming PC i9-14900K RTX 4080 Super 64GB 2TB SSD.','RTX 4080 Super|4K gaming|Pro rendering','Black',4.5,82,'gaming pc msi rtx 4080 intel computer powerful'],
['GameStation Pro Lenovo Ryzen 7 RTX 4070','Lenovo','electronics','laptop',79990,0,'Gaming PC Ryzen 7 7800X3D RTX 4070 Super 32GB 1TB.','AMD Ryzen|RTX 4070|Esports ready','Black',4.3,78,'gaming pc lenovo ryzen rtx amd computer games'],
['GameStation Pro Acer i7 RTX 4060 Ti','Acer','electronics','laptop',69990,0,'Gaming PC Intel i7 RTX 4060 Ti 16GB 1TB for beginners.','RTX 4060 Ti|Entry level|Silent','Black',4.2,75,'gaming pc acer rtx 4060 ti intel entry level'],
['GameStation Pro Gigabyte i9 RTX 4090','Gigabyte','electronics','laptop',249990,0,'Top config i9-14900K RTX 4090 64GB 4TB for 4K.','RTX 4090|4K ready|Max config','Black',4.7,86,'gaming pc gigabyte rtx 4090 top 4k intel computer'],
['GameStation Pro HP Ryzen 9 RTX 4080','HP','electronics','laptop',119990,0,'Gaming PC AMD Ryzen 9 7950X RTX 4080 Super 32GB.','AMD Ryzen 9|RTX 4080|Multitask beast','Black',4.4,80,'gaming pc hp ryzen rtx amd computer power'],
['GameStation Pro Dell Alienware i9 RTX 4090','Dell','electronics','laptop',299990,0,'Alienware PC i9-14900KF RTX 4090 premium assembly.','Alienware design|RTX 4090|Premium','Black',4.8,88,'gaming pc dell alienware rtx 4090 premium intel'],
['GameStation Pro ASUS ROG i5 RTX 4060','ASUS','electronics','laptop',59890,0,'Budget gaming PC ASUS ROG i5 RTX 4060 16GB 512GB.','Budget|RTX 4060|ROG quality','Black',4.2,72,'gaming pc asus rog rtx 4060 budget computer starter'],
['GameStation Pro MSI i7 RTX 4070','MSI','electronics','laptop',89990,0,'Balanced PC MSI i7-14700F RTX 4070 32GB 1TB.','Balanced|1440p gaming|RTX 4070','Black',4.4,79,'gaming pc msi rtx 4070 balanced computer 1440p'],
['GameStation Pro Lenovo Ryzen 5 RX 7600','Lenovo','electronics','laptop',59990,0,'Entry gaming PC AMD Ryzen 5 RX 7600 16GB 512GB.','AMD budget|RX 7600|Entry level','Black',4.1,70,'gaming pc lenovo ryzen rx amd budget entry'],

['ASUS ROG Zephyrus G16','ASUS','electronics','laptop',129990,0,'Gaming laptop Core Ultra 9 RTX 4070 32GB 2.5K 240Hz.','2.5K 240Hz|RTX 4070|Thin body','Black',4.5,83,'gaming laptop asus rog g16 rtx 240hz thin'],
['MSI Stealth 16 Studio','MSI','electronics','laptop',139990,0,'Thin gaming laptop i9-13900H RTX 4070 QHD 240Hz.','QHD 240Hz|Thin|RTX 4070','Black',4.5,82,'gaming laptop msi stealth thin rtx 4070'],
['Lenovo Legion Pro 7','Lenovo','electronics','laptop',169990,0,'Gaming laptop i9-14900HX RTX 4080 WQXGA 240Hz.','WQXGA 240Hz|RTX 4080|Pro','Black',4.6,85,'gaming laptop lenovo legion pro rtx 4080'],
['Acer Nitro 16','Acer','electronics','laptop',79990,0,'Affordable gaming laptop Ryzen 7 RTX 4060 FHD 165Hz.','FHD 165Hz|RTX 4060|Affordable','Black',4.3,78,'gaming laptop acer nitro rtx 4060 affordable'],
['Gigabyte AORUS 17','Gigabyte','electronics','laptop',189990,0,'Gaming laptop i9-13900H RTX 4080 QHD 360Hz esports.','QHD 360Hz|RTX 4080|Esports','Black',4.6,86,'gaming laptop gigabyte aorus rtx 4080 360hz esports'],
['HP Victus 16','HP','electronics','laptop',69990,0,'Budget gaming laptop Ryzen 5 RTX 4050 FHD 144Hz.','FHD 144Hz|RTX 4050|Budget','Black',4.2,74,'gaming laptop hp victus rtx budget student'],
['ASUS TUF Gaming A16','ASUS','electronics','laptop',84990,0,'Durable gaming laptop Ryzen 7 RX 7600S FHD 144Hz.','AMD RX|Military grade|FHD','Black',4.3,77,'gaming laptop asus tuf amd rx durable workhorse'],
['Razer Blade 16','Razer','electronics','laptop',299990,0,'Premium gaming laptop i9-14900HX RTX 4090 4K 240Hz.','4K 240Hz|RTX 4090|Premium aluminum','Black',4.8,90,'gaming laptop razer blade rtx 4090 4k premium'],

['MSI Optix MAG274QRF-QD 27','MSI','electronics','monitor',35990,0,'27 QHD 165Hz IPS gaming monitor accurate colors.','QHD 165Hz|IPS panel|Fast response','Black',4.4,75,'monitor msi gaming 27 ips 165hz color accurate'],
['ASUS ROG Swift PG27AQDM 27','ASUS','electronics','monitor',69990,0,'27 1440p 240Hz OLED gaming monitor fast response.','OLED 240Hz|1440p|Fast','Black',4.6,82,'monitor asus rog oled 240hz 1440p gaming'],
['Samsung Odyssey G8 32','Samsung','electronics','monitor',99990,0,'32 4K 240Hz Mini-LED monitor gaming cinema.','4K 240Hz|Mini-LED|32 inch','Black',4.7,84,'monitor samsung odyssey 4k 240hz mini-led gaming'],
['LG 27GP850-B UltraGear','LG','electronics','monitor',29990,0,'27 QHD 165Hz Nano IPS monitor 1ms response.','Nano IPS|165Hz|1ms','Black',4.4,76,'monitor lg ultragear 27 ips 165hz gaming'],
['Dell S2722DGM 27','Dell','electronics','monitor',22990,0,'27 QHD 165Hz VA curved gaming monitor.','VA curved|165Hz|27 inch','Black',4.3,73,'monitor dell curved gaming 27 va 165hz'],
['Acer Predator X34 34','Acer','electronics','monitor',69990,0,'34 UWQHD 180Hz IPS curved ultrawide monitor.','Ultrawide 34|180Hz|IPS','Black',4.5,80,'monitor acer predator curved ultrawide 34 gaming'],
['Gigabyte M32U 32','Gigabyte','electronics','monitor',49990,0,'32 4K 144Hz IPS monitor for work and games.','4K 144Hz|IPS|Work and play','Black',4.4,78,'monitor gigabyte 4k 144hz ips work games'],
['Lenovo Legion Y27q-30','Lenovo','electronics','monitor',29990,0,'27 QHD 180Hz IPS gaming monitor adjustable.','QHD 180Hz|IPS|Adjustable','Black',4.4,75,'monitor lenovo legion gaming qhd 180hz adjustable'],
['ASUS ProArt PA279CRV 27','ASUS','electronics','monitor',39990,0,'27 4K 60Hz IPS monitor for design accurate color.','4K design|Accurate color|IPS','Black',4.3,72,'monitor asus proart 4k design work color accurate'],
['AOC CQ27G3S 27','AOC','electronics','monitor',18990,0,'27 QHD 165Hz VA curved budget gaming monitor.','QHD curved|165Hz|Budget','Black',4.2,70,'monitor aoc budget gaming curved qhd 165hz'],

['Sony PlayStation 5 Slim','Sony','electronics','console',59990,0,'Gaming console SSD 4K HDR DualSense game library.','PS5 Slim|4K HDR|DualSense','White',4.6,85,'console playstation ps5 gaming sony slim 4k'],
['Sony PlayStation 5 Digital','Sony','electronics','console',49990,0,'Digital PS5 SSD 1TB no disc drive games online.','PS5 Digital|SSD 1TB|Game library','White',4.5,83,'console playstation digital ps5 gaming sony online'],
['Microsoft Xbox Series X','Microsoft','electronics','console',59990,0,'Console 12TF GPU 1TB SSD Quick Resume Game Pass.','Xbox Series X|Game Pass|12TF','Black',4.6,84,'console xbox series x microsoft gaming game pass'],
['Microsoft Xbox Series S','Microsoft','electronics','console',34990,0,'Compact digital console SSD 512GB Game Pass 1440p.','Xbox Series S|Compact|Game Pass','White',4.4,78,'console xbox series s microsoft compact digital budget'],
['Nintendo Switch OLED','Nintendo','electronics','console',39990,0,'Hybrid console 7 OLED detachable joy-cons mobile.','Nintendo Switch|OLED|Hybrid portable','White',4.5,80,'console nintendo switch oled hybrid portable gaming'],
['Steam Deck OLED 1TB','Valve','electronics','console',69990,0,'Portable PC console for Steam AMD APU 7.4 OLED.','Steam Deck|OLED|Portable PC','Black',4.7,82,'console steam deck oled portable pc valve gaming'],

['SteelSeries Apex Pro TKL','SteelSeries','electronics','keyboard',14990,0,'Mechanical keyboard OmniPoint 2.0 RGB esports TKL.','OmniPoint 2.0|RGB|Esports TKL','Black',4.4,72,'keyboard steelseries mechanical omnipoint rgb esports'],
['Razer Huntsman V3 Pro','Razer','electronics','keyboard',18990,0,'Optical keyboard instant response analog WASD RGB.','Optical switches|Analog WASD|RGB','Black',4.5,74,'keyboard razer optical gaming rgb analog'],
['Keychron Q1 Pro','Keychron','electronics','keyboard',14990,0,'Wireless 75 keyboard aluminum hot-swap QMK VIA.','Aluminum|Hot-swap|QMK VIA','Black',4.5,73,'keyboard keychron wireless mechanical hot-swap qmk'],
['Logitech G915 TKL','Logitech','electronics','keyboard',16990,0,'Thin Low Profile wireless keyboard Lightspeed RGB.','Low Profile|Lightspeed|Thin','Black',4.4,72,'keyboard logitech wireless thin low profile lightspeed'],
['HyperX Alloy Origins 65','HyperX','electronics','keyboard',9990,0,'Compact 65 keyboard HyperX Red switches RGB.','65 compact|HyperX Red|RGB','Black',4.3,70,'keyboard hyperx compact mechanical rgb 65'],
['ASUS ROG Azoth','ASUS','electronics','keyboard',24990,0,'Premium 75 keyboard OLED display swappable switches.','OLED display|Hot-swap|Premium','Black',4.6,78,'keyboard asus rog premium wireless oled hot-swap'],

['Razer DeathAdder V3 Pro','Razer','electronics','keyboard',12990,0,'Wireless mouse Focus Pro 30K 63g up to 90h.','Wireless|Light 63g|Pro sensor','Black',4.5,76,'mouse razer wireless gaming light pro sensor'],
['Logitech G Pro X Superlight 2','Logitech','electronics','keyboard',13990,0,'Ultra-light 60g mouse HERO 2 32K DPI Lightspeed.','60g|HERO 2|32K DPI','Black',4.6,78,'mouse logitech wireless light 60g esports'],
['SteelSeries Aerox 5 Wireless','SteelSeries','electronics','keyboard',11990,0,'Light 74g mouse IP54 mesh body TrueMove Air.','IP54|Mesh body|74g','Black',4.4,72,'mouse steelseries wireless light mesh gaming'],
['ASUS ROG Harpe Ace Aim Lab','ASUS','electronics','keyboard',14990,0,'Mouse 54g Aim Lab ROG AimPoint 36K sensor.','54g|Aim Lab|36K sensor','Black',4.5,75,'mouse asus rog light aim lab esports sensor'],
['Glorious Model O 2','Glorious','electronics','keyboard',6290,0,'Wired mouse 59g BAMF 2.0 sensor flexible cable RGB.','Wired|59g|RGB|Flexible cable','Black',4.3,70,'mouse glorious wired light rgb budget esports'],

['HyperX Cloud III Wireless','HyperX','electronics','headphones',14990,0,'Wireless headset DTS Headphone X 120h battery.','Wireless|120h battery|DTS audio','Black',4.5,74,'headset hyperx wireless gaming 120h battery'],
['SteelSeries Arctis Nova 7 Wireless','SteelSeries','electronics','headphones',16990,0,'Headset ANC 2.4GHz Bluetooth 38h battery.','ANC|Bluetooth|38h battery','Black',4.5,75,'headset steelseries wireless anc bluetooth gaming'],
['Razer BlackShark V2 Pro','Razer','electronics','headphones',19990,0,'Headset HyperClear Super Wideband 70h THX Spatial.','THX Spatial|70h|Wideband mic','Black',4.6,76,'headset razer gaming wireless thx microphone spatial'],
['Logitech G PRO X 2 Lightspeed','Logitech','electronics','headphones',20990,0,'Headset GRAPHENE drivers Blue VO!CE esports.','GRAPHENE|Blue VO!CE|Esports','Black',4.6,77,'headset logitech esports graphene microphone lightspeed'],
['ASUS ROG Delta S Wireless','ASUS','electronics','headphones',18990,0,'Wireless headset 50mm MQA AI noise cancel mic.','50mm drivers|MQA|AI noise cancel','Black',4.5,75,'headset asus rog wireless 50mm mqa ai mic'],
];

// ═══ SMARTSPACE — smart home/office (50 items) ═══
const ssData = [
['Samsung QN90D Neo QLED 55','Samsung','home','monitor',44990,0,'55 4K Neo QLED 120Hz Smart TV HDR10 Dolby Atmos.','4K QLED|HDR10|Dolby Atmos','Black',4.5,78,'tv samsung qled 4k 55 120hz smart hdr dolby'],
['LG C4 OLED 65','LG','home','monitor',99990,0,'65 4K OLED 120Hz Smart TV deep blacks Dolby Vision.','4K OLED|Deep blacks|Dolby Vision','Black',4.6,82,'tv lg oled 4k 120hz 65 smart dolby vision'],
['Samsung QN90D 65','Samsung','home','monitor',74990,0,'65 4K Neo QLED 120Hz large Smart TV for living room.','65 4K QLED|HDR|Smart TV','Black',4.5,80,'tv samsung 65 4k qled large smart living room'],
['LG C4 OLED 55','LG','home','monitor',74990,0,'55 4K OLED 120Hz Smart TV compact for room.','4K OLED|Compact|Smart TV','Black',4.6,81,'tv lg oled 55 4k smart compact room'],
['Sony Bravia X90L 55','Sony','home','monitor',59990,0,'55 4K Full Array LED 120Hz XR processor smart TV.','Full Array LED|XR processor|4K 120Hz','Black',4.5,79,'tv sony bravia 4k led 120hz smart xr processor'],
['Xiaomi Mi TV Q2 55','Xiaomi','home','monitor',29990,0,'55 4K QLED 60Hz budget Smart TV Android TV.','4K QLED|Budget|Android TV','Black',4.3,74,'tv xiaomi qled 4k budget smart android'],
['Sony Bravia A80L OLED 55','Sony','home','monitor',89990,0,'55 4K OLED 120Hz Acoustic Surface sound from screen.','OLED|Acoustic Surface|4K 120Hz','Black',4.6,83,'tv sony bravia oled acoustic surface 4k smart'],
['Samsung The Frame 65','Samsung','home','monitor',89990,0,'65 4K QLED matte display Art Mode for interior.','Matte display|Art Mode|4K QLED','Black',4.5,77,'tv samsung the frame art matte interior design'],

['Xiaomi Smart Camera C500 Pro','Xiaomi','electronics','phone',4990,0,'IP camera 3K 360 rotation AI detection night mode.','3K resolution|360 rotation|AI detection','White',4.3,72,'camera xiaomi ip 3k rotation night ai security'],
['Aqara Camera Hub G3','Aqara','home','phone',6990,0,'Camera 2K with Zigbee hub AI face recognition audio.','Zigbee hub|AI faces|2K','White',4.4,73,'camera aqara zigbee hub smart home 2k face'],
['TP-Link Tapo C520WS','TP-Link','electronics','phone',5990,0,'Outdoor IP camera 2K spotlight color night IP66.','Outdoor|Spotlight|IP66','White',4.4,74,'camera outdoor tp-link spotlight night ip66 security'],
['Ezviz C8W Pro','Ezviz','electronics','phone',7990,0,'PTZ camera 4MP auto-tracking color night Wi-Fi 6.','PTZ|Auto-tracking|4MP','White',4.3,72,'camera ezviz ptz 4mp tracking wifi security'],
['Reolink RLC-811A','Reolink','electronics','phone',8990,0,'Outdoor camera 4K LED vehicle human detection PoE.','4K|LED|PoE detection','White',4.5,76,'camera outdoor reolink 4k poe detection led security'],
['Xiaomi Outdoor Camera BW500','Xiaomi','electronics','phone',6990,0,'Solar outdoor camera 2.5K IP67 autonomous power.','Solar|Autonomous|IP67','White',4.3,71,'camera xiaomi outdoor solar autonomous 2.5k security'],
['Imou Cruiser 2','Imou','electronics','phone',4490,0,'Rotating WiFi camera 4MP AI person detection siren.','Rotating|AI detection|Siren','White',4.2,70,'camera imou rotating ai detection siren wifi security'],
['TP-Link Tapo C420S2','TP-Link','electronics','phone',7990,0,'Wireless camera 2K hub battery night mode.','Wireless|Hub|Battery powered','White',4.3,70,'camera wireless tp-link hub battery 2k security'],

['Keenetic Giga KN-1011','Keenetic','electronics','phone',4990,0,'Wi-Fi 6 AX1800 router USB VPN mesh support.','Wi-Fi 6|Mesh|USB VPN','Black',4.4,72,'router keenetic wifi 6 mesh usb vpn gigabit'],
['TP-Link Archer AX73','TP-Link','electronics','phone',6990,0,'Wi-Fi 6 AX5400 router OFDMA MU-MIMO HomeShield.','Wi-Fi 6|AX5400|OFDMA','Black',4.5,74,'router tp-link wifi 6 ax5400 ofdma powerful signal'],
['Xiaomi Router AX3000T','Xiaomi','electronics','phone',3490,0,'Wi-Fi 6 router 4x antennas mesh-ready NFC.','Wi-Fi 6|Mesh ready|NFC','Black',4.3,70,'router xiaomi wifi 6 mesh nfc 4 antennas budget'],
['Keenetic Hopper KN-3810','Keenetic','electronics','phone',8990,0,'Wi-Fi 6E router 2.5G WAN USB 3.0 cloud management.','Wi-Fi 6E|2.5G|USB 3.0','Black',4.5,76,'router keenetic wifi 6e 2.5g gigabit usb cloud'],
['TP-Link Deco X50 Mesh 3-pack','TP-Link','electronics','phone',14990,0,'Mesh system Wi-Fi 6 AX3000 3 units 600m coverage.','Mesh|3 units|600m','White',4.5,77,'mesh tp-link wifi 6 system 3 pack coverage home'],
['Xiaomi Mesh System AX3000 2-pack','Xiaomi','electronics','phone',9990,0,'Mesh kit Wi-Fi 6 400m beamforming coverage.','Mesh|Wi-Fi 6|2 pack','White',4.4,73,'mesh xiaomi wifi 6 kit coverage apartment beamforming'],
['TP-Link Archer BE550','TP-Link','electronics','phone',19990,0,'Wi-Fi 7 router BE9300 2.5G ports Multi-Link.','Wi-Fi 7|2.5G ports|Multi-Link','Black',4.6,79,'router tp-link wifi 7 be9300 ultra fast new standard'],
['Keenetic Peak VDSL','Keenetic','electronics','phone',4490,0,'VDSL ADSL modem-router Wi-Fi 5 USB 4-port switch.','VDSL ADSL|USB|4 ports','Black',4.3,71,'modem router keenetic vdsl adsl wifi landline'],

['Yandex Station Max 2','Yandex','home','speaker',19990,0,'Smart speaker Zigbee hub Alice LED screen quality sound.','Zigbee hub|Alice AI|LED screen','Black',4.5,76,'smart speaker yandex alice zigbee hub station led'],
['Yandex Station Midi 2','Yandex','home','speaker',9990,0,'Mid-size smart speaker Alice Bluetooth home control.','Alice AI|Bluetooth|Mid-size','Black',4.4,73,'smart speaker yandex alice midi bluetooth home'],
['Yandex Station Light 2','Yandex','home','speaker',4990,0,'Compact smart speaker Alice voice control affordable.','Alice AI|Compact|Voice control','Black',4.3,70,'smart speaker yandex light alice compact voice affordable'],
['Aqara Hub M3','Aqara','home','speaker',7990,0,'Zigbee 3.0 Matter hub IR control Thread PoE.','Zigbee Matter|Thread|IR control','White',4.4,72,'hub aqara zigbee matter thread smart home center'],
['Xiaomi Smart Speaker IR','Xiaomi','home','speaker',3990,0,'Smart speaker IR remote for appliance control.','IR remote|Speaker|Appliance control','White',4.2,68,'speaker xiaomi ir remote control appliances smart'],

['Samsung SmartThings Hub','Samsung','home','speaker',9990,0,'Smart home center Zigbee Z-Wave Matter Thread.','Zigbee|Z-Wave|Matter','Black',4.4,74,'hub samsung smartthings zigbee zwave matter smart home'],

['Epson EH-TW7000 4K','Epson','home','monitor',99990,0,'4K PRO-UHD projector HDR 3000lm home theater.','4K|HDR|3000lm|Home theater','White',4.5,75,'projector epson 4k home theater hdr 3000lm cinema'],
['BenQ TK710','BenQ','home','monitor',69990,0,'4K HDR gaming projector 3200lm low input lag 16ms.','4K HDR|3200lm|Low lag 16ms','White',4.4,73,'projector benq 4k gaming hdr low input lag bright'],
['Xiaomi Mi Laser Projector 150','Xiaomi','home','monitor',49990,0,'Ultra short throw laser projector ALPD 150 30cm.','Laser|Ultra short throw|150 inch','White',4.4,72,'projector xiaomi laser ultra short throw alpd 150'],
['BenQ GV31','BenQ','home','monitor',34990,0,'Portable LED projector 1080p Dynamic Black 2.1 audio.','LED|Portable|1080p','White',4.3,70,'projector portable benq led 1080p battery camping'],
['ViewSonic PX748-4K','ViewSonic','home','monitor',79990,0,'4K HDR projector brightness 4000lm presentations home.','4K HDR|4000lm|Presentations','White',4.4,72,'projector viewsonic 4k hdr bright 4000lm presentations'],
['Samsung Freestyle 2','Samsung','home','monitor',49990,0,'Portable LED projector Full HD auto-correction 360 sound.','LED|Portable|Auto-correction','White',4.4,73,'projector samsung portable led auto correction full hd'],

['Canon PIXMA G3411','Canon','electronics','phone',8990,0,'Inkjet MFP CISS print A4 copy scan Wi-Fi.','CISS tank|Wi-Fi|MFP','White',4.3,70,'printer canon mfp ciss inkjet wifi scan copy home'],
['HP LaserJet M140we','HP','electronics','phone',9990,0,'BW laser printer Wi-Fi HP Smart toner 1000 pages.','Laser|Wi-Fi|Compact','White',4.3,71,'printer hp laser bw wifi compact toner 1000 pages'],
['Epson EcoTank L3250','Epson','electronics','phone',12990,0,'Color MFP CISS Wi-Fi printing without cartridges.','CISS|Color|Wi-Fi econom','White',4.4,73,'printer epson ecotank ciss color wifi ink tank economical'],
['Brother DCP-L3550CDW','Brother','electronics','phone',24990,0,'Color laser MFP duplex Wi-Fi NFC toner 2300 pages.','Color laser|Duplex|Wi-Fi NFC','White',4.5,76,'printer brother laser color duplex wifi nfc office'],
['Canon SELPHY QX20','Canon','electronics','phone',6990,0,'Compact photo printer 10x15 wireless smartphone print.','Photo printer|Wireless|Compact','White',4.2,68,'photo printer canon compact wireless 10x15 smartphone'],
['HP OfficeJet Pro 9135e','HP','electronics','phone',19990,0,'Office MFP print copy scan fax ADF Wi-Fi 6.','Office MFP|ADF|Wi-Fi 6','White',4.4,74,'printer hp office mfp wifi 6 fax adf high speed'],

['Synology DS224+','Synology','electronics','phone',29990,0,'2-bay NAS DSM Docker backup video surveillance.','NAS|Docker|Backup','Black',4.6,78,'nas synology storage docker backup video surveillance'],
['WD My Cloud EX2 Ultra','WD','electronics','phone',19990,0,'2-bay NAS for home cloud multimedia Plex.','NAS|Cloud|Multimedia','Black',4.4,72,'nas wd cloud storage home multimedia plex'],
['Seagate Backup Plus Hub 8TB','Seagate','electronics','phone',16990,0,'External HDD 8TB USB hub backup storage.','8TB|USB hub|Backup','Black',4.3,70,'external drive seagate hdd 8tb usb backup storage'],
['Samsung T7 Shield 2TB','Samsung','electronics','phone',14990,0,'External SSD IP65 USB 3.2 1050MB/s portable.','SSD|IP65|1050MB/s','Black',4.5,76,'external ssd samsung fast portable ip65 2tb usb-c'],
['Anker PowerPort III 65W','Anker','electronics','phone',3490,0,'GaN charger 65W 2 ports USB-C Power Delivery.','GaN 65W|USB-C|PD','Black',4.4,74,'charger anker gan 65w usb-c power delivery fast'],
['APC Back-UPS Pro 1500VA','APC','electronics','phone',12990,0,'UPS 1500VA for PC router office surge protection.','UPS|1500VA|Surge protection','Black',4.4,73,'ups apc backup power surge 1500va office pc router'],
['Brother TPE Cube XP','Brother','electronics','phone',5990,0,'Compact label printer Bluetooth sticker office.','Bluetooth|Label|Compact','White',4.2,68,'label printer brother bluetooth stickers office compact'],
['Yandex Capsule Neo','Yandex','home','speaker',6990,0,'Smart speaker Alice AI LED clock wireless audio compact.','Alice AI|LED clock|Compact','Black',4.3,71,'smart speaker yandex capsule neo alice clock compact'],
];

// ── Build catalog ──
const catalog = [...tnData.map(p => make('technomarket', p)), ...gpData.map(p => make('gamepower', p)), ...ssData.map(p => make('smartspace', p))];

const tn = catalog.filter(p => p.shopSlug === 'technomarket');
const gp = catalog.filter(p => p.shopSlug === 'gamepower');
const ss = catalog.filter(p => p.shopSlug === 'smartspace');

writeFileSync(`${OUT}/generated_catalog_2026.json`, JSON.stringify({ products: catalog, total: catalog.length }, null, 2));
writeFileSync(`${OUT}/shops/technomarket_products.json`, JSON.stringify(tn, null, 2));
writeFileSync(`${OUT}/shops/gamepower_products.json`, JSON.stringify(gp, null, 2));
writeFileSync(`${OUT}/shops/smartspace_products.json`, JSON.stringify(ss, null, 2));

// Photo tasks CSV — 1 row per product
function ph(shop, sku, i) { return `client/public/demo-products/${shop}/${sku}-${i}.jpg`; }
const csvHeader = 'shopSlug,sku,name,brand,category,productType,photo1_local,photo2_local,photo3_local,photo4_optional_local';
const csvRows = catalog.map(p => [
  p.shopSlug, p.sku, p.name, p.brand, p.category, p.productType,
  ph(p.shopSlug, p.sku, 1), ph(p.shopSlug, p.sku, 2),
  ph(p.shopSlug, p.sku, 3), ph(p.shopSlug, p.sku, 4),
].join(','));
writeFileSync(`${OUT}/photo_tasks_2026.csv`, csvHeader + '\n' + csvRows.join('\n'));

console.log(`Total: ${catalog.length} products`);
console.log(`  technomarket: ${tn.length} (Apple-only)`);
console.log(`  gamepower: ${gp.length}`);
console.log(`  smartspace: ${ss.length}`);
console.log('OK');
