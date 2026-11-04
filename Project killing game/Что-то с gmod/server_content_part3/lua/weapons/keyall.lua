if SERVER then
	AddCSLuaFile()
end

SWEP.PrintName			= "Ключ от всех комнат"
SWEP.Author				= "DDF"
SWEP.Instructions				= "ЛКМ - открыть дверь\nПКМ - закрыть дверь"
SWEP.Spawnable				= true
SWEP.Category				= "DDF"

SWEP.Slot = 1 

SWEP.ViewModel			= "models/ddf/c_key_card.mdl"
SWEP.WorldModel			= "models/ddf/key-card_alliance.mdl" 
SWEP.ViewModelFOV = 54
SWEP.UseHands = true

SWEP.AnimPrefix	 		= "rpg"

SWEP.Primary.ClipSize		= -1
SWEP.Primary.DefaultClip	= -1
SWEP.Primary.Automatic		= true
SWEP.Primary.Ammo			= "none"
SWEP.DrawAmmo = false

SWEP.Secondary.ClipSize		= -1
SWEP.Secondary.DefaultClip	= -1
SWEP.Secondary.Automatic	= false
SWEP.Secondary.Ammo			= "none"

SWEP.DrawCrosshair = false

SWEP.HitDistance = 48

SWEP.BounceWeaponIcon  = false

--local chars = {["Makoto"] = "Макото Наеги",["Aoi"] = "Аой Асахина",["Byakuya"] = "Бьякуя Тогами",["Celestia"] = "Селестия Люденберг",["Chihiro"] = "Чихиро Фуджисаки",["Hifumi"] = "Хифуми Ямада",["Junko"] = "Джунко Эношима",["Kiyotaka"] = "Киётака Ишимару",["Kyoko"] = "Кёко Киригири",["Mondo"] = "Мондо Овада",["Leon"] = "Леон Кувата",["Mukuro"] = "Мукуро Икусаба",["Sakura"] = "Сакура Огами",["Sayaka"] = "Саяка Майзоно",["Toko"] = "Токо Фукава",["Yasuhiro"] = "Ясухиро Хагакуре",["Hajime"] = "Хаджиме Хината",["Akane"] = "Акане Овари",["Imposter"] = "Бьякуя Тогами",["Chiaki"] = "Чиаки Нанами",["Fuyuhiko"] = "Фуюхико Кузурю",["Gundham"] = "Гандам Танака",["Hiyoko"] = "Хиёко Сайонджи",["Ibuki"] = "Ибуки Миода",["Kazuichi"] = "Казуичи Сода",["Mahiru"] = "Махиру Коидзуми",["Mikan"] = "Микан Тсумики",["Nagito"] = "Нагито Комаеда",["Nekomaru"] = "Некомару Нидай",["Peko"] = "Пеко Пекояма",["Sonia"] = "Сония Невермайнд",["Teruteru"] = "Терутеру Ханамура",["Rantaro"] = "Рантаро Амами",["Kaede"] = "Каедэ Акаматсу",["Angie"] = "Анджи Йонага",["Gonta"] = "Гонта Гокухара",["Himiko"] = "Химико Юмено",["k1-b0"] = "K1-B0",["Kaito"] = "Кайто Момота",["Kirumi"] = "Кируми Тоджо",["Kokichi"] = "Кокичи Ома",["Korekiyo"] = "Корекиё Шингуджи",["Maki"] = "Маки Харукава",["Miu"] = "Миу Ирума",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами"}


function SWEP:DrawWeaponSelection( x, y, wide, tall, alpha )
	
	-- Set us up the texture
	surface.SetDrawColor( 255, 255, 255, alpha )
	surface.SetMaterial( Material("weaponicon/key2.png" ))
	
	-- Lets get a sin wave to make it bounce
	local fsin = 0
	
	if ( self.BounceWeaponIcon == true ) then
		fsin = math.sin( CurTime() * 10 ) * 5
	end
	
	-- Borders
	y = y + 10
	x = x + 10
	wide = wide - 20
	
	-- Draw that mother
	surface.DrawTexturedRect( x + (fsin), y - (fsin),  wide-fsin*2 , ( wide / 2 ) + (fsin) )
	
	-- Draw weapon info box
	self:PrintWeaponInfo( x + wide + 20, y + tall * 0.95, alpha )
	
end

local function GetPlayerName(PlayerName)
	local Name = ""
if PlayerName == "Макото Наеги" or PlayerName == "Макото Наэги" then 
	Name = "Makoto"
		elseif (PlayerName == "Акане Овари" or PlayerName == "Аканэ Овари") then 
		Name = "Akane"
		elseif (PlayerName == "Анджи Йонага" or PlayerName == "Анджи Ёнага") then 
		Name = "Angie"
		elseif PlayerName == "Аой Асахина" then 
		Name = "Aoi"
        elseif PlayerName == "Чиюки" then 
		Name = "Chiuki"
        elseif PlayerName == "Нона" then 
		Name = "Nona"
        elseif PlayerName == "Деким" then 
		Name = "Dekim"
		elseif PlayerName == "Чиаки Нанами" then 
		Name = "Chiaki"
		elseif (PlayerName == "Селестия Люденбург" or PlayerName == "Селестия Люденбёрг" or PlayerName == "Селестия Люденберг") then 
		Name = "Celestia"
		elseif PlayerName == "Бьякуя Тогами" then 
		Name = "Byakuya"
        elseif PlayerName == "Импостер" then 
		Name = "Imposter"
		elseif PlayerName == "Чихиро Фуджисаки" then 
		Name = "Chihiro"
		elseif PlayerName == "Фуюхико Кузурю" then 
		Name = "Fuyuhiko"
		elseif PlayerName == "Гонта Гокухара" then 
		Name = "Gonta"
		elseif PlayerName == "Гандам Танака" then 
		Name = "Gundham"
		elseif (PlayerName == "Хаджиме Хината" or PlayerName == "Хадзиме Хината") then 
		Name = "Hajime"
		elseif (PlayerName == "Изуру Камукура") then 
		Name = "hAjime"
		elseif PlayerName == "Хифуми Ямада" then 
		Name = "Hifumi"
		elseif PlayerName == "Химико Юмено" then 
		Name = "Himiko"
		elseif (PlayerName == "Хиёко Сайонджи" or PlayerName == "Хиёко Сайондзи")then 
		Name = "Hiyoko"
		elseif PlayerName == "Ибуки Миода" then 
		Name = "Ibuki"
		elseif PlayerName == "Джунко Эношима" then 
		Name = "Junko"
        elseif PlayerName == "Мукуро Икусаба" then 
		Name = "Mukuro"
		elseif (PlayerName == "K1-B0" or PlayerName == "Киибо"or PlayerName == "Кибо") then 
		Name = "K1-B0"
		elseif (PlayerName == "Каедэ Акаматсу" or PlayerName == "Каэдэ Акаматсу") then 
		Name = "Kaede"
		elseif (PlayerName == "Каэдe Акаматсу" or PlayerName == "Каедe Акаматсу") then 
		Name = "Kaede"
		elseif (PlayerName == "Каедэ Акамацу" or PlayerName == "Каэдэ Акамацу") then 
		Name = "Kaede"
		elseif (PlayerName == "Каэдe Акамацу" or PlayerName == "Каедe Акамацу") then 
		Name = "Kaede"
		elseif (PlayerName == "Кайто Момота" or PlayerName == "Каито Момота") then 
		Name = "Kaito"
		elseif (PlayerName == "Казуичи Сода" or PlayerName == "Казуити Сода") then 
		Name = "Kazuichi"
		elseif PlayerName == "Кируми Тоджо" then 
		Name = "Kirumi"
		elseif (PlayerName == "Киётака Ишимару" or PlayerName == "Кийотака Ишимару") then 
		Name = "Kiyotaka"
		elseif PlayerName == "Кокичи Ома" then 
		Name = "Kokichi"
		elseif (PlayerName == "Корекиё Шингуджи" or PlayerName == "Корекиё Шингудзи" or PlayerName == "Корекие Шингуджи" or PlayerName == "Корекие Шингудзи") then 
		Name = "Korekiyo"
		elseif PlayerName == "Кёко Киригири" then 
		Name = "Kyoko"
		elseif PlayerName == "Леон Кувата" then 
		Name = "Leon"
		elseif (PlayerName == "Махиру Коидзуми" or PlayerName == "Махиру Коизуми") then 
		Name = "Mahiru"
		elseif PlayerName == "Маки Харукава" then 
		Name = "Maki"
		elseif (PlayerName == "Микан Тсумики" or PlayerName == "Микан Цумики") then 
		Name = "Mikan"
		elseif PlayerName == "Миу Ирума" then 
		Name = "Miu"
		elseif PlayerName == "Мондо Овада" then 
		Name = "Mondo"
		elseif PlayerName == "Монодам" then 
		Name = "Monodam"
		elseif PlayerName == "Монокид" then 
		Name = "Monokid"
		elseif PlayerName == "Монокума" then 
		Name = "Monokuma"
        elseif PlayerName == "Курокума" then 
		Name = "Kurokuma"
        elseif PlayerName == "Усами" then 
		Name = "Usami"
		elseif PlayerName == "Монофанни" then 
		Name = "Monophanie"
		elseif PlayerName == "Моноске" then 
		Name = "Monosuke"
		elseif PlayerName == "Монотаро" then 
		Name = "Monotaro"
		elseif (PlayerName == "Нагито Комаеда" or PlayerName == "Нагито Комаэда") then 
		Name = "Nagito"
		elseif PlayerName == "Некомару Нидай" then 
		Name = "Nekomaru"
		elseif PlayerName == "Пеко Пекояма" then 
		Name = "Peko"
		elseif PlayerName == "Рантаро Амами" then 
		Name = "Rantaro"
		elseif PlayerName == "Рёма Хоши" then 
		Name = "Ryoma"
		elseif PlayerName == "Сакура Огами" then 
		Name = "Sakura"
		elseif (PlayerName == "Саяка Маизоно" or PlayerName == "Саяка Майзоно") then 
		Name = "Sayaka"
		elseif (PlayerName == "Шуичи Саихара" or PlayerName == "Шуичи Сайхара") then 
		Name = "Shuichi"
		elseif (PlayerName == "Сония Невермайнд" or PlayerName == "Соня Невермайнд" or PlayerName == "Сонья Невермайнд") then 
		Name = "Sonia"
		elseif PlayerName == "Тенко Чабашира" then 
		Name = "Tenko"
		elseif PlayerName == "Терутеру Ханамура" then 
		Name = "Teruteru"
		elseif PlayerName == "Токо Фукава" then 
		Name = "Toko"
		elseif PlayerName == "Терутеру Ханамура" then 
		Name = "Teruteru"
		elseif (PlayerName == "Тсумуги Широгане" or PlayerName == "Цумуги Широгане" or PlayerName == "Тсумуги Широганэ" or PlayerName == "Цумуги Широганэ") then 
		Name = "Tsumugi"
		elseif (PlayerName == "Ясухиро Кагакурэ" or PlayerName == "Ясухиро Хагакурэ" or PlayerName == "Ясухиро Кагакуре" or PlayerName == "Ясухиро Хагакуре") then 
		Name = "Yasuhiro"
        elseif (PlayerName == "Юкари Коиме") then 
		Name = "Yukari"
        elseif (PlayerName == "Чинами Хасами") then 
		Name = "Chinami"
		elseif PlayerName == "Эмма Магороби" then 
		Name = "Emma"
		elseif PlayerName == "Шобай Хашимото" then 
		Name = "Shobai"
		elseif PlayerName == "Хибики Отонокоджи" then 
		Name = "Hibiki"
		elseif PlayerName == "Ироха Ниджиуэ" then 
		Name = "Iroha"
		elseif PlayerName == "Канаде Отонокоджи" then 
		Name = "Kanade"
		elseif PlayerName == "Кокоро Митсуме" then 
		Name = "Kokoro"
		elseif PlayerName == "Хаджиме Макуноучи" then 
		Name = "Makunouchi"
		elseif PlayerName == "Микадо Санноджи" then 
		Name = "Mikado"
		elseif PlayerName == "Никей Йомиури" then 
		Name = "Nikei"
		elseif PlayerName == "Сетсука Чибукуро" or PlayerName == "Сецука Чибукуро" then 
		Name = "Setsuka"
		elseif PlayerName == "Шинджи Касай" then 
		Name = "Shinji"
		elseif PlayerName == "Теруя Отори" then 
		Name = "Teruya"
		elseif PlayerName == "Йоруко Кабуя" then 
		Name = "Yoruko"
		elseif PlayerName == "Юки Маеда" then 
		Name = "Yuki"
		elseif PlayerName == "Сора" then 
		Name = "Sora"
		elseif PlayerName == "Юри Кагарин" then 
		Name = "Yuri"
		elseif PlayerName == "Монокров" then 
		Name = "Monocrow"
		elseif PlayerName == "Рёта Митарай" then 
		Name = "Ryota"
		elseif PlayerName == "Нико Химуро" then 
		Name = "Nico"
		elseif PlayerName == "Килллакума" then 
		Name = "Killlakuma"
		elseif PlayerName == "Марин Мизута" then 
		Name = "Marin"
		elseif PlayerName == "Сейко Кимура" then 
		Name = "Seiko"
		elseif PlayerName == "Шуичи Сaихара" or PlayerName == "Шуичи Сaйхара" then 
		Name = "Femaleshuichi"
		elseif PlayerName == "Кaедэ Акаматсу" then 
		Name = "Malekaede"
		elseif PlayerName == "Комару Наеги" then 
		Name = "Komaru"
		elseif PlayerName == "Тcумуги Широгане" then 
		Name = "Maletsumugi"
        elseif PlayerName == "Минамото Тетсуо" then 
		Name = "Minamoto"
        elseif PlayerName == "Усами" then 
		Name = "usami"
        elseif PlayerName == "Сейши Йодогава" then 
		Name = "Seishi"
		elseif PlayerName == "Аюму Фуджимори" then 
		Name = "Ayumu"
		elseif PlayerName == "Акира Цучия" then 
		Name = "Akira"
		elseif PlayerName == "Арума Тодороки" then 
		Name = "Aruma"
		elseif PlayerName == "Касуми Изумо" then 
		Name = "Kasumi"
		elseif PlayerName == "Казуоми Самеджима" then 
		Name = "Kazuomi"
		elseif PlayerName == "Кего Сакума" then 
		Name = "Kego"
		elseif PlayerName == "Майко Кагура" then 
		Name = "Maiko"
		elseif PlayerName == "Микото Итсуки" then 
		Name = "Mikoto"
		elseif PlayerName == "Мисузу Айсака" then 
		Name = "Misuzu"
		elseif PlayerName == "Мицунари Кога" then 
		Name = "Mitsunari"
		elseif PlayerName == "Наруми Осоне" then 
		Name = "Narumi"
		elseif PlayerName == "Сайджи Рокудо" then 
		Name = "Saiji"
		elseif PlayerName == "Рёко Отонаши" then 
		Name = "Ryoko"
        elseif PlayerName == "Мисако Рокухана" then
		Name = "Misako"
		elseif PlayerName == "Мин Чжун" then 
		Name = "Min"
        elseif PlayerName == "Мисаки Хомма" then 
		Name = "Misaki"
        elseif PlayerName == "Йоши Симудзу" then 
		Name = "Yoshi"
		elseif PlayerName == "Нана Игараси" then 
		Name = "Nana"
		elseif PlayerName == "Шу Ямамото" then 
		Name = "Shu"
		elseif PlayerName == "Рюдзи Гото" then 
		Name = "Ryuuji"
		elseif PlayerName == "Кохару Китамура" then 
		Name = "Koharu"
		elseif PlayerName == "Йоширо Тогучи" then 
		Name = "Yoshiro"
		elseif PlayerName == "Аюми Хирано" then 
		Name = "Ayumi"
        elseif PlayerName == "Хидеки Такада" then 
		Name = "Hideki"
		elseif PlayerName == "Кермит Невилл" then 
		Name = "Kermit"
        elseif PlayerName == "Хидеёси Сигуяма" then 
		Name = "Hideyoshi"
        elseif PlayerName == "Мари Цудзи" then 
		Name = "Mari"
        elseif PlayerName == "Торо Хаттори" then 
		Name = "Toro"
		elseif PlayerName == "Сецуко Хиросэ" then 
		Name = "Setsuko"
        elseif PlayerName == "Йоко Нагата" then 
		Name = "Yoko"
        elseif PlayerName == "Рикуто Минами" then 
		Name = "Rikuto"
        elseif PlayerName == "Покет" then 
		Name = "Pocket"
        elseif PlayerName == "Грисп" then 
		Name = "Grisp"
        elseif PlayerName == "Кросс" then 
		Name = "Cross"
        elseif PlayerName == "Энигма" then 
		Name = "Enigma"
        elseif PlayerName == "Анон" then 
		Name = "Anon"
        elseif PlayerName == "Мораитеру" then 
		Name = "Moraiteru"
        elseif PlayerName == "Якси" then 
		Name = "Yaxi"
        elseif PlayerName == "Рок" then 
		Name = "Rock"
        elseif PlayerName == "Рокс" then 
		Name = "Rox"
        elseif PlayerName == "Рисси" then 
		Name = "Rissi"
        elseif PlayerName == "Скарлет" then 
		Name = "Scarlet"
        elseif PlayerName == "Твин" then 
		Name = "Twin"
        elseif PlayerName == "Канцел" then 
		Name = "Cancel"
        elseif PlayerName == "Корза" then 
		Name = "Corza"
                elseif PlayerName == "Сара Чидоин" then 
		Name = "Sara"
                elseif PlayerName == "Джо Тазуна" then 
		Name = "Joe"
                elseif PlayerName == "Кейджи Шиноги" then 
		Name = "Keiji"        
    			elseif PlayerName == "Канна Кизучи" then 
		Name = "Kanna"
                elseif PlayerName == "Кью-таро Бургерберг" then 
		Name = "Q-taro"
                elseif PlayerName == "Соу Хиёри" or PlayerName == "Шин Тсукими" then 
		Name = "Shin"
                elseif PlayerName == "Реко Ябусаме" then 
		Name = "Reko"
                elseif PlayerName == "Кай Сато" then 
		Name = "Kai"
                elseif PlayerName == "Гин Ибуш" then 
		Name = "Gin"
                elseif PlayerName == "Элис Ябусаме" or PlayerName == "Гонби Ямада" then 
		Name = "Alice"
                elseif PlayerName == "Ранмару Кагеяма" then 
		Name = "Ranmaru"
                elseif PlayerName == "Май Тсуруги" then 
		Name = "Mai"
                        elseif PlayerName == "Сью Майли" then 
		Name = "Sue"
                        elseif PlayerName == "Тиа Сафалин" then 
		Name = "Safalin"
                        elseif PlayerName == "Гашу" then 
		Name = "Gashu"
                        elseif PlayerName == "Мейстер" then 
		Name = "Meister"
		
else  Name = "Table"
	end
	return Name
end

function SWEP:Initialize()
	self.onHands = true
	self.Time = 0
	self.Range = 150
	self:SetHoldType( "pistol" )
	--self.Weapon.SetLocalModelLights({MATERIAL_LIGHT_POINT,vector_origin,vector_origin,vector_origin, 200, 5, 45, 45, 150, 100, 50,0,1})
	--local VM = self.Owner:GetViewModel()
	--self.ViewModel = Model( "models/dff/c_key_card.mdl" )
	--self.Owner:GetViewModel():SetWeaponModel("models/dff/c_key_card.mdl", self)
end

function SWEP:Deploy()
	--print(self.Weapon:GetPrintName())
	--self.Weapon.PrintName = "Ключи от комнаты Kj[f"
	--print(self.Weapon:GetPrintName())
	--[[if self.Weapon:GetPrintName() == "Ключи от комнаты" then
		local rand = math.random(1000,3000)
		self.Weapon.PrintName = "Ключи от комнаты №"..rand
		--self.Weapon.SlotPos = rand
		--self.Weapon.Slot = rand
	end--]]
	end

function SWEP:SecondaryAttack()
local eyetrace = self.Owner:GetEyeTrace()
local ownerName = GetPlayerName(self.Owner:Name())
if (eyetrace.Entity:GetClass() == "func_door_rotating" and self.Owner:GetPos():Distance(eyetrace.Entity:GetPos()) < 90) then
	if SERVER then
	self.Owner:EmitSound("doors/door_close.mp3")
	eyetrace.Entity:Fire("Lock")
	end
end
if (eyetrace.Entity:GetClass() == "func_button" and self.Owner:GetPos():Distance(eyetrace.Entity:GetPos()) < 90 and !eyetrace.Entity:GetSaveTable().m_bLocked) then

self.Owner:EmitSound("doors/door_close.mp3")

eyetrace.Entity:Fire("Lock")

end
end

function SWEP:PrimaryAttack(right)
local eyetrace = self.Owner:GetEyeTrace()
local ownerName = GetPlayerName(self.Owner:Name())
if (eyetrace.Entity:GetClass() == "func_door_rotating" and self.Owner:GetPos():Distance(eyetrace.Entity:GetPos()) < 90) then
	if SERVER then
	self.Owner:EmitSound("doors/door_open.mp3")
	eyetrace.Entity:Fire("Unlock")
	end
end
if (eyetrace.Entity:GetClass() == "func_button" and self.Owner:GetPos():Distance(eyetrace.Entity:GetPos()) < 90 and eyetrace.Entity:GetSaveTable().m_bLocked ) then

self.Owner:EmitSound("doors/door_open.mp3")
eyetrace.Entity:Fire("Unlock")


end
end



if CLIENT then
	local x, y = ScrW() /2, ScrH() /2
	local MainCol = Color( 255, 255, 255, 255 )
	local Col = Color( 255, 255, 255, 255 )

	function SWEP:DrawHUD()
		if IsValid( self.Owner:GetVehicle() ) then return end
		local Pos = self.Owner:GetShootPos()
		local Aim = self.Owner:GetAimVector()

		local Tr = util.TraceLine{
			start = Pos,
			endpos = Pos +Aim *self.Range,
			filter = player.GetAll(),
		}

		local HitEnt = Tr.Entity
		if IsValid( HitEnt ) and HitEnt:GetMoveType() == MOVETYPE_VPHYSICS and
			not self.rDag and
			not HitEnt:IsVehicle() and
			not IsValid( HitEnt:GetParent() ) and
			not HitEnt:GetNWBool( "NoDrag", false ) then

			self.Time = math.min( 1, self.Time +2 *FrameTime() )
		else
			self.Time = math.max( 0, self.Time -2 *FrameTime() )
		end

		if self.Time > 0 then
			Col.a = MainCol.a *self.Time

			draw.SimpleText(
				"",
				"DermaLarge",
				x,
				y,
				Col,
				TEXT_ALIGN_CENTER
			)
		end

		if self.Drag and IsValid( self.Drag.Entity ) then
			local Pos2 = Pos +Aim *100 *self.Drag.Fraction
			local OffPos = self.Drag.Entity:LocalToWorld( self.Drag.OffPos )
			local Dif = Pos2 -OffPos

			local A = OffPos:ToScreen()
			local B = Pos2:ToScreen()

			surface.DrawRect( A.x -2, A.y -2, 4, 4, MainCol )
			surface.DrawRect( B.x -2, B.y -2, 4, 4, MainCol )
			surface.DrawLine( A.x, A.y, B.x, B.y, MainCol )
		end
	end
end
