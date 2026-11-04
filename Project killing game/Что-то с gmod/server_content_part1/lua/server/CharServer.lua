util.AddNetworkString("Select")
util.AddNetworkString("SetSpeed")
util.AddNetworkString("SetFood")
util.AddNetworkString("CharSelector")
util.AddNetworkString("BodyGroupSelect")
util.AddNetworkString("ModelSelector")
util.AddNetworkString("TokoModelSelector")
util.AddNetworkString("GetSizeScale")
util.AddNetworkString("ButtonCharSelector")

local GamMode = 0

net.Receive('BodyGroupSelect', function() 
	local plyName = net.ReadString()
	local alb = string.find(string.sub(plyName, 0), " ")
	local alb2 = string.find(string.sub(plyName, alb+1), " ")
	local nocom = string.sub(string.sub(plyName, 0), alb+1,alb+alb2-1);
	local nocom2 = string.sub(string.sub(plyName, 0), alb+alb2+1);
	local nick = string.lower(string.sub(string.sub(plyName, 0), 1, alb-1))
	plyName = nick
	local ply
	for k,v in ipairs(player.GetAll()) do
	local dra = string.lower(v:SteamID())
	if (dra == plyName) then
	ply = v
	end
	end
	ply:SetBodygroup(nocom,nocom2)
end)

local modelTable = {}
modelTable["cелестия"] = {"models/player/dewobedil/celestia_ludenberg/default_p.mdl",1}
modelTable["токо"] = {"models/player/dewobedil/danganronpa/toko_fukawa/default_p.mdl",1.03}
modelTable["киётака"] = {"models/player/dewobedil/danganronpa/kiyotaka_ishimaru/default_p.mdl",1}
modelTable["джунко"] = {"models/player/dewobedil/danganronpa/junko_enoshima/default_p.mdl",1.08}
modelTable["сакура"] = {"models/player/yourtoast4/danganronpa/sakura_ogami.mdl",1}
modelTable["хифуми"] = {"models/player/yourtoast4/danganronpa/hifumi_yamada.mdl",1.02}
modelTable["ясухиро"] = {"models/player/dewobedil/danganronpa/yasuhiro_hagakure/default_p.mdl",1}
modelTable["чихиро"] = {"models/player/dewobedil/danganronpa/chihiro/default_p.mdl",0.96}
modelTable["аой"] = {"models/danganronpa_nk/aoi/aoi.mdl",1.08}
modelTable["макото"] = {"models/player/yourtoast4/danganronpa/makoto_naegi.mdl",1}
modelTable["бьякуя"] = {"models/custom/byakuya_togami.mdl",1.05}
modelTable["кёко"] = {"models/danganronpa_nk/kyoko/kyoko.mdl",1.08}
modelTable["саяка"] = {"models/player/dewobedil/sayaka_maizono/default_p.mdl",1.05}
modelTable["леон"] = {"models/player/yourtoast4/danganronpa/leon_kuwata.mdl",0.97}
modelTable["мондо"] = {"models/player/dewobedil/danganronpa/mondo_owada/default_p.mdl",1}
modelTable["импостер"] = {"models/player/dewobedil/danganronpa2/byakuya_togami/default_p.mdl",1.02}
modelTable["хаджиме"] = {"models/player/dewobedil/danganronpa/hajime_hinata/default_p.mdl",1}
modelTable["аканэ"] = {"models/player/yourtoast4/danganronpa/akane_owari.mdl",0.95}
modelTable["гандам"] = {"models/player/dewobedil/gundam_tanaka/default_p.mdl",1.15}
modelTable["казуичи"] = {"models/player/danganronpa/kazuichi_soda.mdl",0.98}
modelTable["нагито"] = {"models/player/dewobedil/nagito_komaeda/default_p.mdl",1.18}
modelTable["некомару"] = {"models/nekomaru/nekomaruniidai.mdl",1.2}
modelTable["хиёко"] = {"models/player/dewobedil/danganronpa/hiyoko_saionji/default_p.mdl",1}
modelTable["чиаки"] = {"models/player/dewobedil/chiaki_nanami/default_p.mdl",1}
modelTable["ибуки"] = {"models/player/dewobedil/danganronpa/ibuki_mioda/default_p.mdl",1}
modelTable["махиру"] = {"models/player/dewobedil/danganronpa/mahiru_koizumi/default_p.mdl",1.01}
modelTable["микан"] = {"models/player/dewobedil/mikan_tsumiki/default_p.mdl",1.01}
modelTable["пеко"] = {"models/player/dewobedil/peko_pekoyama/default_p.mdl",1.065}
modelTable["сония"] = {"models/player/dewobedil/danganronpa/sonia_nevermind/default_p.mdl",1}
modelTable["терутеру"] = {"models/player/yourtoast4/danganronpa/teruteru_hanamura.mdl",0.96}
modelTable["фуюхико"] = {"models/player/dewobedil/danganronpa/fuyuhiko/default_p.mdl",0.975}
modelTable["цумуги"] = {"models/player/dewobedil/danganronpa/tsumugi_shirogane/default_p.mdl",0.98}
modelTable["тенко"] = {"models/player/dewobedil/danganronpa/tenko_chabashira/default_p.mdl",1.015}
modelTable["шуичи"] = {"models/player/dewobedil/danganronpa/shuichi_saihara/default_p.mdl",0.95}
modelTable["корекиё"] = {"models/player/dewobedil/danganronpa/korekiyo_shinguji/default_p.mdl",1.03}
modelTable["кируми"] = {"models/player/dewobedil/danganronpa/kirumi_tojo/default_p.mdl",0.95}
modelTable["кайто"] = {"models/player/dewobedil/danganronpa/kaito_momota/default_p.mdl",0.95}
modelTable["гонта"] = {"models/player/dewobedil/danganronpa/gonta/default_p.mdl",1.2}
modelTable["рантаро"] = {"models/player/dewobedil/danganronpa/rantaro_amami/default_p.mdl",1}
modelTable["анджи"] = {"models/player/dewobedil/danganronpa/angie_yonaga/default_p.mdl",0.985}
modelTable["миу"] = {"models/player/dewobedil/danganronpa/miu_iruma/default_p.mdl",0.96}
modelTable["маки"] = {"models/player/dewobedil/danganronpa/maki_harukawa/default_p.mdl",1}
modelTable["кокичи"] = {"models/player_kokichioumaultimate_notrack.mdl",0.95}
modelTable["k1-b0"] = {"models/player_kiibo.mdl",0.94}
modelTable["химико"] = {"models/player/dewobedil/danganronpa/himiko_yumeno/default_p.mdl",1}
modelTable["каедэ"] = {"models/player/dewobedil/danganronpa/kaede_akamatsu/default_p.mdl",0.95}
modelTable["рёма"] = {"models/player/dewobedil/danganronpa/ryoma_hoshi/default_p.mdl",1.05}
modelTable["рёта"] = {"models/player/dewobedil/danganronpa/ryota_mitarai/default_p.mdl",0.97}
modelTable["комару"] = {"models/player/someguy/komaru_p.mdl",1.02}
modelTable["кокоро"] = {"models/player/ddf/kokoro/default_p.mdl",0.965}
modelTable["микадо"] = {"models/player/ddf/Mikado/default_p.mdl",1.08}
modelTable["макуноучи"] = {"models/player/ddf/makunouchi/default_p.mdl",0.93}
modelTable["шобай"] = {"models/Shobai_Hashimoto/Danganronpa/rstar/Shobai_Hashimoto/Shobai_Hashimoto.mdl",1}
modelTable["никей"] = {"models/player/ddf/nikei/default_p.mdl",1.075}
modelTable["теруя"] = {"models/player/ddf/Teruya/default_p.mdl",1.25}
modelTable["шинджи"] = {"models/player/ddf/shinji/default_p.mdl",1.11}
modelTable["ироха"] = {"models/Iroha_Nijiue/Super_Danganronpa_Another/rstar/Iroha_Nijiue/Iroha_Nijiue.mdl",1}
modelTable["сетсука"] = {"models/player/ddf/Setsuka/default_p.mdl",0.96}
modelTable["йоруко"] = {"models/player/ddf/Yoruko/default_p.mdl",0.90}
modelTable["хибики"] = {"models/player/ddf/hibiki/default_p.mdl",0.87}
modelTable["канаде"] = {"models/player/ddf/kanade/default_p.mdl",0.87}
modelTable["юки"] = {"models/player/ddf/Yuki/default_p.mdl",1.05}
modelTable["юри"] = {"models/player/ddf/yuri/default_p.mdl",0.93}
modelTable["сора"] = {"models/player/sdra2/sora/sora_p.mdl",0.94}
modelTable["эмма"] = {"models/player/sdra2/emma/emma_p.mdl",1.025}
modelTable["монокид"] = {"models/player/dewobedil/danganronpa/monokubs/monokid_p.mdl",1}
modelTable["монотаро"] = {"models/player/dewobedil/danganronpa/monokubs/monotaro_p.mdl",1}
modelTable["монокума"] = {"models/player/yourtoast4/danganronpa/monokuma.mdl",1}
modelTable["усами"] = {"models/player/dewobedil/usami/default_p.mdl",1}
modelTable["монофанни"] = {"models/player/dewobedil/danganronpa/monokubs/monofunny_p.mdl",1}
modelTable["моноске"] = {"models/player/dewobedil/danganronpa/monokubs/monosuke_p.mdl",1}
modelTable["монодам"] = {"models/player/dewobedil/danganronpa/monokubs/monodam_p.mdl",1}
modelTable["рёко"] = {"models/pacagma/dangaronpa/ryoko/ryoko_player.mdl",1}
modelTable["мукуро"] = {"models/pacagma/danganronpa/mukuro_ikusaba/mukuro_ikusaba_player.mdl",1.02}
modelTable["сейко"] = {"models/player/brvnx/danganronpa/seiko_kimura/seiko_kimura.mdl",0.92}
modelTable["изуру"] = {"models/player/hikyo/danganronpa/izuru_kamukura/izuru_p.mdl",1}
modelTable["нико"] = {"models/player/ddf/nico/default_p.mdl",0.91}
modelTable["акира"] = {"models/player/ddf/akira/default_p.mdl",1.06}
modelTable["сайджи"] = {"models/player/ddf/saiji/default_p.mdl",1.12}
modelTable["марин"] = {"models/player/ddf/marin/default_p.mdl",1.025}
modelTable["микото"] = {"models/player/ddf/mikoto/default_p.mdl",1}
modelTable["майко"] = {"models/player/ddf/maiko/default_p.mdl",1.01}
modelTable["мисузу"] = {"models/player/ddf/misuzu/default_p.mdl",0.98}
modelTable["арума"] = {"models/player/ddf/aruma/default_p.mdl",0.96}
modelTable["сейши"] = {"models/player/ddf/seishi/default_p.mdl",1.16}
modelTable["мицунари"] = {"models/player/ddf/mitsunari/default_p.mdl",1.2}
modelTable["аюму"] = {"models/player/ddf/ayumu/default_p.mdl",1}
modelTable["кего"] = {"models/player/ddf/kego/default_p.mdl",1.02}
modelTable["казуоми"] = {"models/player/ddf/kazuomi/default_p.mdl",0.945}
modelTable["касуми"] = {"models/player/ddf/Kasumi/default_p.mdl",1.05}
modelTable["наруми"] = {"models/player/ddf/narumi/default_p.mdl",0.9}
modelTable["покет"] = {"models/player/ddf/pocket/default_p.mdl",1.01}
modelTable["грисп"] = {"models/player/ddf/grisp/default_p.mdl",1.14}
modelTable["кросс"] = {"models/player/ddf/cross/default_p.mdl",1.02}
modelTable["энигма"] = {"models/player/ddf/enigma/default_p.mdl",1}
modelTable["анон"] = {"models/player/ddf/anon/default_p.mdl",1.07}
modelTable["мораитеру"] = {"models/player/ddf/moraiteru/default_p.mdl",0.9}
modelTable["якси"] = {"models/player/ddf/yaxi/default_p.mdl",1.06}
modelTable["рок"] = {"models/player/ddf/rock/default_p.mdl",0.85}
modelTable["рокс"] = {"models/player/ddf/rox/rox.mdl",1.03}
modelTable["рисси"] = {"models/player/ddf/rissi/default_p.mdl",0.85}
modelTable["скарлет"] = {"models/player/ddf/scarlet/default_p.mdl",0.96}
modelTable["твин"] = {"models/player/ddf/twin/default_p.mdl",0.97}
modelTable["канцел"] = {"models/player/ddf/cancel/default_p.mdl",1.04}
modelTable["корза"] = {"models/player/ddf/corza/default_p.mdl",1.11}


local function GetModel(Model)
    if modelTable[Model:lower()] != nil then
        return modelTable[Model:lower()]
    end
    return {Model,1}
    end

net.Receive('ModelSelector', function() 
		local tbl = net.ReadTable()
        local plyName = tbl[1]
		local nocom = GetModel(tbl[2])
		local ply
		for k,v in ipairs(player.GetAll()) do
		if (plyName == v:SteamID()) then
			ply = v
		end
		end
		ply:SetModel( nocom[1] )
		ply:SetupHands()
		ply:SetModelScale(nocom[2])
		local playermodel = player_manager.TranslateToPlayerModelName( ply:GetModel() )
		local mhands = player_manager.TranslatePlayerHands(playermodel)
		local hands = ply:GetHands()
		hands:SetModel( mhands.model )
		hands:SetSkin( mhands.skin )
		hands:SetBodyGroups( mhands.body )
		ply:SetPathM(nocom[1])
end)

net.Receive('TokoModelSelector', function() 
		local tbl = net.ReadTable()
        local ply = tbl[1]
		local nocom = tbl[2]
		if (nocom == false) then
			ply:SetModel( "models/player/dewobedil/danganronpa/toko_fukawa/genocide_p.mdl" )
			ply:SetupHands()
		else
			ply:SetModel( "models/player/dewobedil/danganronpa/toko_fukawa/default_p.mdl" )
			ply:SetupHands()
		end
		local playermodel = player_manager.TranslateToPlayerModelName( ply:GetModel() )
		local mhands = player_manager.TranslatePlayerHands(playermodel)
		local hands = ply:GetHands()
		hands:SetModel( mhands.model )
		hands:SetSkin( mhands.skin )
		hands:SetBodyGroups( mhands.body )
		ply:SetPathM(ply:GetModel())
end)

net.Receive('Select', function(len, pl)
	local plyName = net.ReadString()
	local alb = string.find(string.sub(plyName, 0), " ")
	local nocom = string.sub(string.sub(plyName, 2), alb);
	local nick = string.lower(string.sub(string.sub(plyName, 0), 1, alb-1))
	local model
	local nameModel
	local name
	plyName = nick
	local ply
	for k,v in ipairs(player.GetAll()) do
		local dra = string.lower(v:SteamID())
		if (dra == plyName) then
		ply = v
		end
	end
	local mats={{},{}}
    local bgroups={0,0,0,0,0,0,0,0}
    local modelSize = 1
    local y = nocom:find(" ")
    if(y!=nil) then
		local x1 = nocom:sub(2,y)
		local x2 = nocom:sub(y+2,nocom:len())
		local x3 = nocom:sub(y+1,y+1)
		local x4 = nocom:sub(1,1)
		x2 = x2:gsub("О","о")
		x1 = x1:gsub("О","о")
		nocom = x4..x1..x3..x2
	else 
		local x1 = nocom:sub(1,1)
		local x2 = nocom:sub(2,nocom:len())
		local x2 = x2:gsub("О","о")
		nocom = x1..x2
	end
		
if (nocom == 'Селестия Люденберг')	then
	model = "models/player/dewobedil/celestia_ludenberg/default_p.mdl"
	nameModel = "Celestia Ludenberg"
    modelSize = 1
end

if (nocom == 'Токо Фукава')	then
	model =  "models/player/dewobedil/danganronpa/toko_fukawa/default_p.mdl"
	nameModel = "Toko Fukawa"
            modelSize = 1.03
end
	
if (nocom == 'Киётака Ишимару')	then
	model = "models/player/dewobedil/danganronpa/kiyotaka_ishimaru/default_p.mdl"
	nameModel = "Kiyotaka Ishimaru"
end

if (nocom == 'Джунко Эношима')	then
	model = "models/player/dewobedil/danganronpa/junko_enoshima/default_p.mdl"
	nameModel = "Junko Enoshima (Default)"
            modelSize = 1.08
end

if (nocom == 'Сакура Огами')	then
	model = "models/player/yourtoast4/danganronpa/sakura_ogami.mdl"
	nameModel = "Sakura Ogami"
end

if (nocom == 'Хифуми Ямада')	then
	model = "models/player/yourtoast4/danganronpa/hifumi_yamada.mdl"
	nameModel = "Hifumi Yamada"
            modelSize = 1.02
end

if (nocom == 'Ясухиро Хагакуре')	then
	model = "models/player/dewobedil/danganronpa/yasuhiro_hagakure/default_p.mdl"
	nameModel = "Yasuhiro Hagakure (Danganronpa)"
end

if (nocom == 'Чихиро Фуджисаки')	then
	model = "models/player/dewobedil/danganronpa/chihiro/default_p.mdl"
	nameModel = "Chihiro"
            modelSize = 0.96
end

if (nocom == 'Аой Асахина')	then
	model = "models/danganronpa_nk/aoi/aoi.mdl"
	nameModel = "Aoi Asahina (DR)"
            modelSize = 1.08
end

if (nocom == 'Макото')	then
	model = "models/player/yourtoast4/danganronpa/makoto_naegi.mdl"
	nameModel = "Makoto Naegi"
end

if (nocom == 'Бьякуя Тогами')	then
	model = "models/custom/byakuya_togami.mdl"
	nameModel = "Byakuya Togami"
            modelSize = 1.05
end

if (nocom == 'Кёко')	then
	model = "models/future_foundation_kyoko_kirigiri/danganronpa/rstar/future_foundation_kyoko_kirigiri/future_foundation_kyoko_kirigiri.mdl"
	nameModel = "future_foundation_kyoko_kirigiri"
            modelSize = 1.08
end

if (nocom == 'Саяка Майзоно')	then
	model = "models/player/dewobedil/sayaka_maizono/default_p.mdl"
	nameModel = "Sayaka Maizono"
            modelSize = 1.05
end

if (nocom == 'Леон Кувата')	then
	model = "models/player/yourtoast4/danganronpa/leon_kuwata.mdl"
	nameModel = "Leon Kuwata"
            modelSize = 0.97
end

if (nocom == 'Мондо Овада')	then
	model = "models/player/dewobedil/danganronpa/mondo_owada/default_p.mdl"
	nameModel = "Mondo Owada"
end

if (nocom == 'Импостер')	then
	model = "models/player/dewobedil/danganronpa2/byakuya_togami/default_p.mdl"
	nameModel = "Byakuya Togami (DR2)"
            modelSize = 1.02
end

if (nocom == 'Хаджиме Хината')	then
	model =  "models/player/dewobedil/danganronpa/hajime_hinata/default_p.mdl"
	nameModel = "Hajime Hinata"
end
	
if (nocom == 'Аканэ Овари')	then
	model = "models/player/yourtoast4/danganronpa/akane_owari.mdl"
	nameModel = "Akane Owari"
            modelSize = 0.95
end

if (nocom == 'Гандам Танака')	then
	model = "models/player/dewobedil/gundam_tanaka/default_p.mdl"
	nameModel = "Gundam Tanaka"
            modelSize = 1.15
end

if (nocom == 'Казуичи Сода')	then
	model = "models/player/danganronpa/kazuichi_soda.mdl"
	nameModel = "Kazuichi Soda"
            modelSize = 0.98
end

if (nocom == 'Нагито')	then
	model = "models/player/dewobedil/nagito_komaeda/default_p.mdl"
	nameModel = "Nagito Komaeda"
            modelSize = 1.18
end

if (nocom == 'Некомару Нидай')	then
	model = "models/nekomaru/nekomaruniidai.mdl"
	nameModel = "Nekomaru"
            modelSize = 1.2
end

if (nocom == 'Хиёко Сайонджи')	then
	model = "models/player/dewobedil/danganronpa/hiyoko_saionji/default_p.mdl"
	nameModel = "Hiyoko Saionji (Danganronpa)"
end

if (nocom == 'Чиаки Нанами')	then
	model = "models/player/dewobedil/chiaki_nanami/default_p.mdl"
	nameModel = "Chiaki Nanami"
end

if (nocom == 'Ибуки Миода')	then
	model = "models/player/dewobedil/danganronpa/ibuki_mioda/default_p.mdl"
	nameModel = "Ibuki Mioda"
end

if (nocom == 'Махиру Коидзуми')	then
	model = "models/player/dewobedil/danganronpa/mahiru_koizumi/default_p.mdl"
	nameModel = "Mahiru Koizumi"
            modelSize = 1.01
end

if (nocom == 'Микан Цумики')	then
	model = "models/player/dewobedil/mikan_tsumiki/default_p.mdl"
	nameModel = "Mikan Tsumiki"
            modelSize = 1.01
end

if (nocom == 'Пеко Пекояма')	then
	model = "models/player/dewobedil/peko_pekoyama/default_p.mdl"
	nameModel = "Peko Pekoyama"
            modelSize = 1.065
end

if (nocom == 'Сония Невермайнд')	then
	model = "models/player/dewobedil/danganronpa/sonia_nevermind/default_p.mdl"
	nameModel = "Sonia Nevermind"
end

if (nocom == 'Терутеру Ханамура')	then
	model = "models/player/yourtoast4/danganronpa/teruteru_hanamura.mdl"
	nameModel = "Teruteru Hanamura"
            modelSize = 0.96
end

if (nocom == 'Фуюхико Кузурю')	then
	model = "models/player/dewobedil/danganronpa/fuyuhiko/default_p.mdl"
	nameModel = "Fuyuhiko Kuzuryu"
            modelSize = 0.975
end

if (nocom == 'Цумуги Широгане')	then
	model = "models/player/dewobedil/danganronpa/tsumugi_shirogane/default_p.mdl"
	nameModel = "Tsumugi Shirogane"
            modelSize = 0.98
end

if (nocom == 'Тенко Чабашира')	then
	model =  "models/player/dewobedil/danganronpa/tenko_chabashira/default_p.mdl"
	nameModel = "Tenko Chabashira"
            modelSize = 1.015
end
	
if (nocom == 'Шуичи')	then
	model = "models/player/dewobedil/danganronpa/shuichi_saihara/default_p.mdl"
	nameModel = "Shuichi Saihara"
            modelSize = 0.95
end

if (nocom == 'Корекиё Шингуджи')	then
	model = "models/player/dewobedil/danganronpa/korekiyo_shinguji/default_p.mdl"
	nameModel = "Korekiyo Shinguji"
            modelSize = 1.03
end

if (nocom == 'Кируми Тоджо')	then
	model = "models/player/dewobedil/danganronpa/kirumi_tojo/default_p.mdl"
	nameModel = "Kirumi Tojo"
            modelSize = 0.95
end

if (nocom == 'Кайто Момота')	then
	model = "models/player/dewobedil/danganronpa/kaito_momota/default_p.mdl"
	nameModel = "Kaito Momota"
            modelSize = 0.95
end

if (nocom == 'Гонта Гокухара')	then
	model = "models/player/dewobedil/danganronpa/gonta/default_p.mdl"
	nameModel = "Gonta (Danganronpa)"
    modelSize = 1.2
end

if (nocom == 'Рантаро')	then
	model = "models/player/dewobedil/danganronpa/rantaro_amami/default_p.mdl"
	nameModel = "Rantaro Amami"
end

if (nocom == 'Анджи Йонага')	then
	model = "models/player/dewobedil/danganronpa/angie_yonaga/default_p.mdl"
	nameModel = "Angie Yonaga"
            modelSize = 0.985
end

if (nocom == 'Миу Ирума')	then
	model = "models/player/dewobedil/danganronpa/miu_iruma/default_p.mdl"
	nameModel = "Miu Iruma"
            modelSize = 0.96
end

if (nocom == 'Маки Харукава')	then
	model = "models/player/dewobedil/danganronpa/maki_harukawa/default_p.mdl"
	nameModel = "Maki Harukawa"
            
end

if (nocom == 'Кокичи Ома')	then
	model = "models/player_kokichioumaultimate_notrack.mdl"
	nameModel = "Kokichi Oma Ulimate Uniform - No eyetrack"
            modelSize = 0.95
end

if (nocom == 'K1-B0')	then
	model = "models/player_kiibo.mdl"
	nameModel = "K1-B0"
            modelSize = 0.94
end

if (nocom == 'Химико Юмено')	then
	model = "models/player/dewobedil/danganronpa/himiko_yumeno/default_p.mdl"
	nameModel = "Himiko Yumeno"
end

if (nocom == 'Каедэ Акаматсу')	then
	model = "models/player/dewobedil/danganronpa/kaede_akamatsu/default_p.mdl"
	nameModel = "Kaede Akamatsu"
            modelSize = 0.95
end

if (nocom == 'Рёма Хоши')	then
	model = "models/player/dewobedil/danganronpa/ryoma_hoshi/default_p.mdl"
	nameModel = "Ryoma Hoshi"
            modelSize = 1.05
end

if (nocom == 'Рёта')	then
	model = "models/player/dewobedil/danganronpa/ryota_mitarai/default_p.mdl"
	nameModel = "Ryota Mitarai (Danganronpa)"
	modelSize = 0.97
end

if (nocom == 'Комару')	then
	model = "models/player/someguy/komaru_p.mdl"
	nameModel = "Komaru Naegi (UDG)"
	modelSize = 1.02
end

if (nocom == 'Кокоро Митсуме')	then
	model = "models/player/ddf/kokoro/default_p.mdl"
	nameModel = "Kokoro"
            modelSize = 0.965
end

if (nocom == 'Микадо Санноджи')	then
	model =  "models/player/ddf/Mikado/default_p.mdl"
	nameModel = "Mikado"
            --bgroups = {0,0,0,1,1,1,1,1,0,0}
            modelSize = 1.08
end
	
if (nocom == 'Хаджиме Макуноучи')	then
	model = "models/player/ddf/makunouchi/default_p.mdl"
	nameModel = "Makunouchi"
            modelSize = 0.93
end

if (nocom == 'Шобай')	then
	model = "models/Shobai_Hashimoto/Danganronpa/rstar/Shobai_Hashimoto/Shobai_Hashimoto.mdl"
	nameModel = "SDRA Shobai Hashimoto"
end

if (nocom == 'Никей')	then
	model = "models/player/ddf/nikei/default_p.mdl"
	nameModel = "Nikei"
            modelSize = 1.075
end

if (nocom == 'Теруя Отори')	then
	model = "models/player/ddf/Teruya/default_p.mdl"
	nameModel = "Teruya"
            modelSize = 1.25
            --bgroups = {0,0,1,1,1,1,1}
end

if (nocom == 'Шинджи Касай')	then
	model = "models/player/ddf/shinji/default_p.mdl"
	nameModel = "Shinji"
            modelSize = 1.11
end

if (nocom == 'Ироха Ниджиуэ')	then
	model = "models/Iroha_Nijiue/Super_Danganronpa_Another/rstar/Iroha_Nijiue/Iroha_Nijiue.mdl"
	nameModel = "Super Danganronpa Another Another Iroha Nijiue"
end

if (nocom == 'Сетсука Чибукуро')	then
	model = "models/player/ddf/Setsuka/default_p.mdl"
	nameModel = "Setsuka"
            modelSize = 0.96
end

if (nocom == 'Йоруко Кабуя')	then
	model = "models/player/ddf/Yoruko/default_p.mdl"
	nameModel = "Yoruko"
    modelSize = 0.90
end

if (nocom == 'Хибики Отонокоджи')	then
	model = "models/player/ddf/hibiki/default_p.mdl"
	nameModel = "Hibiki"
            modelSize = 0.87
end

if (nocom == 'Канаде Отонокоджи')	then
	model = "models/player/ddf/kanade/default_p.mdl"
	nameModel = "Kanade"
            modelSize = 0.87
end

if (nocom == 'Юки')	then
	model = "models/player/ddf/Yuki/default_p.mdl"
	nameModel = "Maeda"
            modelSize = 1.05
end

if (nocom == 'Юри Кагарин')	then
	model = "models/player/ddf/yuri/default_p.mdl"
	nameModel = "Yuri"
            modelSize = 0.93
end

if (nocom == 'Сора')	then
	model = "models/player/sdra2/sora/sora_p.mdl"
	nameModel = "Sora"
            modelSize = 0.94
            --bgroups = {0,0,0,1}
end

if (nocom == 'Эмма Магороби')	then
	model = "models/player/sdra2/emma/emma_p.mdl"
	nameModel = "Emma Magorobi"
            modelSize = 1.025
            --bgroups = {0,0,1,1}
end

if (nocom == 'Монокид')	then
	model = "models/player/dewobedil/danganronpa/monokubs/monokid_p.mdl"
	nameModel = "Monokubs (Monokid)"
            --modelSize = 0.5
end

if (nocom == 'Монотаро')	then
	model = "models/player/dewobedil/danganronpa/monokubs/monotaro_p.mdl"
	nameModel = "Monokubs (Monotaro)"
end

if (nocom == 'Монокума')	then
	model = "models/player/yourtoast4/danganronpa/monokuma.mdl"
	nameModel = "Monokuma"
            --modelSize = 0.6
end

if (nocom == 'Усами')	then
	model = "models/player/dewobedil/usami/default_p.mdl"
	nameModel = "Usami"
end

if (nocom == 'Монофанни')	then
	model = "models/player/dewobedil/danganronpa/monokubs/monofunny_p.mdl"
	nameModel = "Monokubs (Monofunny)"
            
end

if (nocom == 'Моноске')	then
	model = "models/player/dewobedil/danganronpa/monokubs/monosuke_p.mdl"
	nameModel = "Monokubs (Monosuke)"
end

if (nocom == 'Монодам')	then
	model = "models/player/dewobedil/danganronpa/monokubs/monodam_p.mdl"
	nameModel = "Monokubs (Monodam)"
end
        
if (nocom == 'Рёко Отонаши')	then
	model = "models/pacagma/dangaronpa/ryoko/ryoko_player.mdl"
	nameModel = "Ryoko Otonashi"
end

if (nocom == 'Мукуро Икусаба')	then
	model = "models/pacagma/danganronpa/mukuro_ikusaba/mukuro_ikusaba_player.mdl"
	nameModel = "Mukuro Ikusaba"
            modelSize = 1.02
end

if (nocom == 'Сейко Кимура')	then
	model = "models/player/brvnx/danganronpa/seiko_kimura/seiko_kimura.mdl"
	nameModel = "Seiko Kimura"
	modelSize = 0.92
end

if (nocom == 'Изуру Камукура')	then
	model = "models/player/hikyo/danganronpa/izuru_kamukura/izuru_p.mdl"
	nameModel = "Izuru Kamukura"
end

if (nocom == 'Нико')	then
	model = "models/player/ddf/nico/default_p.mdl"
	nameModel = "Nico"
	modelSize = 0.91
end

if (nocom == 'Акира Цучия')	then
	model = "models/player/ddf/akira/default_p.mdl"
	nameModel = "Akira"
	modelSize = 1.06
end

if (nocom == 'Сайджи Рокудо')	then
	model = "models/player/ddf/saiji/default_p.mdl"
	nameModel = "Saiji"
	modelSize = 1.12
            --bgroups = {0,0,1}
end

if (nocom == 'Марин Мизута')	then
	model = "models/player/ddf/marin/default_p.mdl"
	nameModel = "Marin"
	modelSize = 1.025
end

if (nocom == 'Микото')	then
	model = "models/player/ddf/mikoto/default_p.mdl"
	nameModel = "Mikoto"
end

if (nocom == 'Майко Кагура')	then
	model = "models/player/ddf/maiko/default_p.mdl"
	nameModel = "Maiko"
	modelSize = 1.01
end

if (nocom == 'Мисузу Айсака')	then
	model = "models/player/ddf/misuzu/default_p.mdl"
	nameModel = "Misuzu"
	modelSize = 0.98
end

if (nocom == 'Арума Тодороки')	then
	model = "models/player/ddf/aruma/default_p.mdl"
	nameModel = "Aruma"
	modelSize = 0.96
end

if (nocom == 'Сейши Йодогава')	then
	model = "models/player/ddf/seishi/default_p.mdl"
	nameModel = "Seishi"
	modelSize = 1.09
end

if (nocom == 'Мицунари Кога')	then
	model = "models/player/ddf/mitsunari/default_p.mdl"
	nameModel = "Mitsunari"
	modelSize = 1.2
end

if (nocom == 'Аюму Фуджимори')	then
	model = "models/player/ddf/ayumu/default_p.mdl"
	nameModel = "Ayumu"
end

if (nocom == 'Кего Сакума')	then
	model = "models/player/ddf/kego/default_p.mdl"
	nameModel = "Kego"
	modelSize = 1.02
end

if (nocom == 'Казуоми Самеджима')	then
	model = "models/player/ddf/kazuomi/default_p.mdl"
	nameModel = "Kazuomi"
	modelSize = 0.945
end

if (nocom == 'Касуми Изумо')	then
	model = "models/player/ddf/Kasumi/default_p.mdl"
	nameModel = "Kasumi"
	modelSize = 1.05
end

if (nocom == 'Наруми Осоне')	then
	model = "models/player/ddf/narumi/default_p.mdl"
	nameModel = "Narumi"
	modelSize = 0.9
end

if (nocom == 'Покет')	then
	model = "models/player/ddf/pocket/default_p.mdl"
	nameModel = "Pocket"
	modelSize = 1.01
end

if (nocom == 'Грисп')	then
	model = "models/player/ddf/grisp/default_p.mdl"
	nameModel = "Grisp"
	modelSize = 1.14
end

if (nocom == 'Кросс')	then
	model = "models/player/ddf/cross/default_p.mdl"
	nameModel = "Cross"
	modelSize = 1.02
end

if (nocom == 'Энигма')	then
	model = "models/player/ddf/enigma/default_p.mdl"
	nameModel = "Enigma"
	modelSize = 1.0
end

if (nocom == 'Анон')	then
	model = "models/player/ddf/anon/default_p.mdl"
	nameModel = "Anon"
	modelSize = 1.07
end

if (nocom == 'Мораитеру')	then
	model = "models/player/ddf/moraiteru/default_p.mdl"
	nameModel = "Moraiteru"
	modelSize = 0.9
end

if (nocom == 'Якси')	then
	model = "models/player/ddf/yaxi/default_p.mdl"
	nameModel = "Yaxi"
	modelSize = 1.06
end

if (nocom == 'Рок')	then
	model = "models/player/ddf/rock/default_p.mdl"
	nameModel = "Rock"
	modelSize = 0.85
end

if (nocom == 'Рокс')	then
	model = "models/player/ddf/rox/rox.mdl"
	nameModel = "Rox"
	modelSize = 1.03
end

if (nocom == 'Рисси')	then
	model = "models/player/ddf/rissi/default_p.mdl"
	nameModel = "Rissi"
	modelSize = 0.85
end

if (nocom == 'Скарлет')	then
	model = "models/player/ddf/scarlet/default_p.mdl"
	nameModel = "Scarlet"
	modelSize = 0.96
end

if (nocom == 'Твин')	then
	model = "models/player/ddf/twin/default_p.mdl"
	nameModel = "Twin"
	modelSize = 0.97
end

if (nocom == 'Канцел')	then
	model = "models/player/ddf/cancel/default_p.mdl"
	nameModel = "Cancel"
	modelSize = 1.04
end

if (nocom == 'Корза')	then
	model = "models/player/ddf/corza/default_p.mdl"
	nameModel = "Corza"
	modelSize = 1.11
end
	local scaleTrue = true
	name = nocom
	ply:Give("re_hands",false)
	if ply:GetPathM()== model then
		scaleTrue = false
	end
	ply:SetPathM(model)
	ply:SetModel( model )
	for i = 0, ply:GetBoneCount() do
		ply:ManipulateBoneJiggle( i, 0 )
	end

 	if scaleTrue then
	    ply:SetModelScale(modelSize)

	    timer.Simple(0.1, function()
	    	ply:SetViewOffset(ply:GetViewOffset()*modelSize-Vector(0,0,0))
	    end)
	end
        for i = 0, 20 do
        ply:SetSubMaterial(i,nil)
            end
        for i = 0, 20 do
            
            if mats[1][i]~=nil then
                ply:SetSubMaterial(mats[1][i],mats[2][i])
                else
                
                end
            if bgroups[i]~=nil then
                ply:SetBodygroup(i,bgroups[i])
                else
                ply:SetBodygroup(i,0)
                end
            end
	if (player_manager.TranslateToPlayerModelName( ply:GetModel())==nameModel or nameModel == "Emma Magorobi" ) then
	ply:SetupHands()
	local playermodel = player_manager.TranslateToPlayerModelName( ply:GetModel() )
	local mhands = player_manager.TranslatePlayerHands(playermodel)
	local hands = ply:GetHands()
	hands:SetModel( mhands.model )
	hands:SetSkin( mhands.skin )
	hands:SetBodyGroups( mhands.body )
end
ply:SetNWString("PlayerName",name)
net.Start("SetSpeed")
net.Send(pl)
net.Start("SetFood")
net.Send(pl)
ply:SetNWFloat("Avtoritet", 100)
net.Start("CanBeHungryOrNot2")
net.WriteBool(CanBeHungry)
net.Broadcast()
ply:SetNWInt("Monocoins",0)
end)

local function Spawn( ply )
	net.Start("CharSelector")
    net.WriteBool(false)
	net.Send(ply)
end

hook.Add("PlayerLoadout", "Join", function (ply)
    ply:SetWalkSpeed( 90 ) 
    ply:SetRunSpeed(250)
    ply:SetJumpPower(200)
ply:NetworkVar( "String", 0, "PathM" )
if(ply:GetPathM() ~= "") then
	ply:SetModel( ply:GetPathM() )
	local nameModel = player_manager.TranslateToPlayerModelName( ply:GetModel())
	if (player_manager.TranslateToPlayerModelName( ply:GetModel())==nameModel) then
		ply:SetupHands()
		local playermodel = player_manager.TranslateToPlayerModelName( ply:GetModel() )
		local mhands = player_manager.TranslatePlayerHands(playermodel)
		local hands = ply:GetHands()
		hands:SetModel( mhands.model )
		hands:SetSkin( mhands.skin )
		hands:SetBodyGroups( mhands.body )
	end
else
Spawn(ply)
end
	timer.Create( "TimerModel", 0.1, 1, function() 	
		ply:SetModel( ply:GetPathM() )  
		ply:SetupHands()
		local playermodel = player_manager.TranslateToPlayerModelName( ply:GetModel() )
		local mhands = player_manager.TranslatePlayerHands(playermodel)
		local hands = ply:GetHands()
		hands:SetModel( mhands.model )
		hands:SetSkin( mhands.skin )
		hands:SetBodyGroups( mhands.body )
	end )
	ply:Give("re_hands",false)
	return true
end)

hook.Add( "SetModel", "Kringe", function()
		for k,ply in pairs(player.GetAll()) do
			if(ply:GetModel() ~= ply:GetPathM()) then
				ply:SetModel(ply:GetPathM())
			end
		end
end )

local noc = false 
timer.Create( "NoclipCloak", 0.1, 0, function()

	for k,ply in pairs(player.GetAll()) do
	
		ply:SetAvoidPlayers( false )

	local oldstate = ply:GetMoveType()

	if oldstate == MOVETYPE_NOCLIP and not ply:InVehicle()  then
		for k, v in ipairs( ents.FindByClass( "ent_advbonemerge*" ) ) do
			if v:GetParent() == ply then
				v:DrawShadow( false )
				v:SetCollisionGroup( COLLISION_GROUP_PASSABLE_DOOR )
				v:SetMaterial( "models/effects/vol_light001" )
				v:SetRenderMode( RENDERMODE_TRANSALPHA )
				v:Fire( "alpha", 0, 0 )
			end
		end
		noc = true
		ply:DrawShadow( false )
		ply:SetCollisionGroup( COLLISION_GROUP_PASSABLE_DOOR )
		ply:SetMaterial( "models/effects/vol_light001" )
		ply:SetRenderMode( RENDERMODE_TRANSALPHA )
		ply:Fire( "alpha", 0, 0 )
		ply:GetTable().invis = { vis=0, wep=ply:GetActiveWeapon() }
		if IsValid( ply:GetActiveWeapon() ) then
			ply:GetActiveWeapon():SetRenderMode( RENDERMODE_TRANSALPHA )
			ply:GetActiveWeapon():Fire( "alpha", 0, 0 )
			ply:GetActiveWeapon():SetMaterial( "models/effects/vol_light001" )
			if ply:GetActiveWeapon():GetClass() == "gmod_tool" then
				ply:DrawWorldModel( false ) -- tool gun has problems
			else
				ply:DrawWorldModel( true )
			end
		end
	else
		if oldstate ~= MOVETYPE_NOCLIP and not ply:InVehicle() then
			for k, v in ipairs( ents.FindByClass( "ent_advbonemerge*" ) ) do
				if v:GetParent() == ply then
					v:DrawShadow( true )
					v:SetCollisionGroup( COLLISION_GROUP_NONE )
					v:SetMaterial( "" )
					v:SetRenderMode( RENDERMODE_NORMAL )
					v:Fire( "alpha", 255, 0 )
				end
			end
			ply:DrawShadow( true )
			ply:SetCollisionGroup( COLLISION_GROUP_NONE )
			ply:SetMaterial( "" )
			ply:SetRenderMode( RENDERMODE_NORMAL )
			ply:Fire( "alpha", 255, 0 )
			local activeWeapon = ply:GetActiveWeapon()
			if IsValid( activeWeapon ) then
				activeWeapon:SetRenderMode( RENDERMODE_NORMAL )
				activeWeapon:Fire( "alpha", 255, 0 )
				activeWeapon:SetMaterial( "" )
			end
			ply:GetTable().invis = nil
		noc = false
		end
	end
 end

end )


net.Receive("ButtonCharSelector", function(len,ply) 
	net.Start("CharSelector")
        net.WriteBool(true)
	net.Send(ply)
end)

hook.Add("PlayerDroppedWeapon", "PrintWhenDrop1", function(owner, wep)
	if wep:GetClass() == "re_hands" then
			timer.Simple(0.01, function ()
            owner:PickupWeapon( wep, false )
            owner:SelectWeapon(wep)
            end)
            end
end)