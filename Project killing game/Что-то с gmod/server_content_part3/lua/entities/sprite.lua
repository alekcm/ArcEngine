if (SERVER)then
	AddCSLuaFile("sprite.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Sprite"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "CharacterName",	{ KeyName = "CharacterName",	Edit = { type = "String", order = 0} } )
	self:NetworkVar( "Int",	1, "SpriteCount",	{ KeyName = "SpriteCount",	Edit = { type = "Int",	min = 0, max = 150 ,	order = 1} } )
    self:NetworkVar( "String",	2, "PlayerName",	{ KeyName = "PlayerName",	Edit = { type = "String",	order = 2} } )
    self:NetworkVar( "Float",	3, "SpriteSizeScale",	{ KeyName = "SpriteSizeScale",	Edit = { type = "Float",	order = 3} } )
    self:NetworkVar( "Float",	4, "HifumiSizeScale",	{ KeyName = "HifumiSizeScale",	Edit = { type = "Float",	order = 4} } )

if ( SERVER ) then
	self:NetworkVarNotify( "CharacterName", self.OnCharacterNameChanged )
	end
end
--local camera

local SendedNameForCamera
local mat = {}
function ENT:Initialize( )
		self:SetSpriteCount(0)
		self:SetModel("models/hunter/blocks/cube05x05x05.mdl")
		self:SetMaterial("aaa/empty")
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
		self:SetCollisionGroup(20)
		self:SetSpriteSizeScale(1)
		self:SetHifumiSizeScale(1)
		mat[self] = "123"
		local ang = self:GetAngles()
	self:SetAngles(Angle (0,0,0))
if ( SERVER ) then
	local CameraXRange = -35
	local CameraZRange = 5
local PlayerCameraPlace = ents.Create("char_camera")

PlayerCameraPlace:SetPos(self:GetPos()+Vector(CameraXRange, 0, CameraZRange))
PlayerCameraPlace:SetParent(self)

local PlayerCameraPlaceLeft = ents.Create("char_camera")

PlayerCameraPlaceLeft:SetPos(self:GetPos()+Vector(CameraXRange, 20, CameraZRange))
PlayerCameraPlaceLeft:SetParent(self)

local PlayerCameraPlaceRight = ents.Create("char_camera")

PlayerCameraPlaceRight:SetPos(self:GetPos()+Vector(CameraXRange, -20, CameraZRange))
PlayerCameraPlaceRight:SetParent(self)

local PlayerCameraPlaceLong = ents.Create("char_camera")

PlayerCameraPlaceLong:SetPos(self:GetPos()+Vector(-100, 0, CameraZRange))
PlayerCameraPlaceLong:SetParent(self)

local PlayerCameraPlaceNear = ents.Create("char_camera")

PlayerCameraPlaceNear:SetPos(self:GetPos()+Vector(-20, 0, CameraZRange+10))
PlayerCameraPlaceNear:SetParent(self)

local PlayerCameraPlaceDown = ents.Create("char_camera")
	if(PlayerCameraPlaceDown:IsValid()) then
		PlayerCameraPlaceDown:SetPos(self:GetPos()+Vector(CameraXRange, 0, CameraZRange-20))
		PlayerCameraPlaceDown:SetParent(self)
	end

local PlayerCameraPlaceUp = ents.Create("char_camera")

PlayerCameraPlaceUp:SetPos(self:GetPos()+Vector(CameraXRange, 0, CameraZRange+20))
PlayerCameraPlaceUp:SetParent(self)

self:SetNWEntity("PlayerCameraPlace" , PlayerCameraPlace)
self:SetNWEntity("PlayerCameraPlaceLeft" , PlayerCameraPlaceLeft)
self:SetNWEntity("PlayerCameraPlaceRight" , PlayerCameraPlaceRight)
self:SetNWEntity("PlayerCameraPlaceLong" , PlayerCameraPlaceLong)
self:SetNWEntity("PlayerCameraPlaceNear" , PlayerCameraPlaceNear)
self:SetNWEntity("PlayerCameraPlaceDown" , PlayerCameraPlaceDown)
self:SetNWEntity("PlayerCameraPlaceUp" , PlayerCameraPlaceUp)

self:SetAngles(ang)
end
		
	--[[	self.camera = ents.Create("prop_physics")
		if (!IsValid(self.camera)) then return end
		self.camera:SetModel("models/dav0r/camera.mdl")
		self.camera:SetPos(self:GetPos() + Vector(-50,0,50))
		self.camera:SetParent(self)
		self.camera:SetNoDraw(true)
		self.camera:Spawn()
		self.camera:PhysWake()]]

	


end
local _h = 900
local _w = 600
local SendedName = ""
local SendedNumber = 0
function ENT:OnCharacterNameChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SelfName = self:GetCharacterName()
	local SelfNumber = self:GetSpriteCount()
end


net.Receive('ChangeSprite2', function()
	SendedName = net.ReadString()
	SendedNumber = net.ReadFloat()
end)
local CameraPlace
local IsShow = true
net.Receive('ChangeForm', function()
	IsShow = true
	
end)
net.Receive('HideTables2', function()
	IsShow = net.ReadBool()
end)
if SERVER then
function ENT:Use()
	print(self:GetPos())
	print(self:GetAngles())
	print(self:GetCollisionGroup())
end
end
--[[net.Receive ('MoveCamera', function()
	SendedNameForCamera = net.ReadString()
end)]]

local _cam = nil
local _camplace
local _camleft
local _camright
local _camup
local _camdown
local _camnear
local _camlong
local _globalcamera


function Animate(camera, from, to, count)
		camera:SetPos(LerpVector(count, to, from))
		timer.Simple(0.01, function ()
			if count >0.01 then
			Animate(camera, from, to, count-count/100)
		end
			end)

end

function AnimateRotation(camera, from, to, count, int,int1)
		camera:SetPos(LerpVector(count, to, from))
		if int > 0 then
		camera:SetAngles(camera:GetAngles() + Angle( 0, 0, 1 * int1 ))
		int = int - 1
	end
	if int < 0 then
		camera:SetAngles(camera:GetAngles() + Angle( 0, 0, -1 * int1 ))
		int = int + 1
	end

		timer.Simple(0.01, function ()
			if count >0.01 then
			AnimateRotation(camera, from, to, count-count/100, int,int1)
		end
			end)

end

local singleanimation = true

function GetNameAndHeight(Name)
    local PlayerName = ""
    local updown = 0
    local ScaleSize = 1
    local HifumiScale = 1
    local RyomaUp = 0
    if Name == "Makoto" then 
	PlayerName = "Макото Наеги"
	updown = -1.5
	ScaleSize = 0.87
		elseif Name == "Akane" then 
		PlayerName = "Аканэ Овари"
		ScaleSize = 0.88
		updown = -1.5
		elseif Name == "Angie" then 
		PlayerName = "Анджи Йонага"
		updown = -4
		ScaleSize = 0.985
		elseif Name == "Aoi"  then 
		PlayerName = "Аой Асахина"
		updown = -3
		ScaleSize = 0.87
		elseif Name == "Chiaki" then 
		PlayerName = "Чиаки Нанами"
		updown = -3
		ScaleSize = 0.92
		elseif Name == "Celestia" then 
		PlayerName = "Селестия Люденберг"
		updown = -1
		ScaleSize = 0.86
		elseif Name == "Byakuya" then 
		PlayerName = "Бьякуя Тогами"
		updown = 1
        elseif Name == "Imposter" then 
		PlayerName = "Импостер"
		updown = 1
		elseif Name == "Chihiro" then 
		PlayerName = "Чихиро Фуджисаки"
		updown = -6
		ScaleSize = 0.86
		elseif Name == "Fuyuhiko" then 
		PlayerName = "Фуюхико Кузурю"
		updown = -3.5
		ScaleSize = 0.945
		elseif Name == "Gonta" then 
		PlayerName = "Гонта Гокухара"
		ScaleSize = 1.15
		updown = 3
		--HifumiScale = 1.05
		elseif Name == "Gundham" then 
		PlayerName = "Гандам Танака"
		ScaleSize = 0.91
		elseif Name == "Hajime" then 
		PlayerName = "Хаджиме Хината"
		ScaleSize = 0.91
		elseif Name == "Hifumi" then 
		PlayerName = "Хифуми Ямада"
		updown = -2
		ScaleSize = 0.96
		HifumiScale = 1.2
		elseif Name == "Himiko" then 
		PlayerName = "Химико Юмено"
		updown = -5
		elseif Name == "Hiyoko" then 
		PlayerName = "Хиёко Сайонджи"
		updown = -6
		ScaleSize = 0.88
		elseif Name == "Ibuki" then 
		PlayerName = "Ибуки Миода"
		updown = -2
		ScaleSize = 0.935
		elseif Name == "Junko" then 
		PlayerName = "Джунко Эношима"
		ScaleSize = 0.86
		updown = -2
        elseif Name == "Mukuro" then 
		PlayerName = "Мукуро Икусаба"
		ScaleSize = 0.86
		updown = -2
		elseif Name == "K1-B0" then 
		PlayerName = "K1-B0"
		updown = -4
		ScaleSize = 0.99
		elseif Name == "Kaede" then 
		PlayerName = "Каедэ Акаматсу"
		updown = -2.5
		ScaleSize = 0.96
		elseif Name == "Kaito" then 
		PlayerName = "Кайто Момота"
		updown = -1.5
		elseif Name == "Kazuichi" then 
		PlayerName = "Казуичи Сода"
		updown = -1.5
		ScaleSize = 0.89
		elseif Name == "Kirumi" then 
		PlayerName = "Кируми Тоджо"
		updown = -1.5
		ScaleSize = 0.94
		elseif Name == "Kiyotaka" then 
		PlayerName = "Киётака Ишимару"
		updown = -1
		ScaleSize = 0.925
		elseif Name == "Kokichi" then 
		PlayerName = "Кокичи Ома"
		updown = -4
		ScaleSize = 0.99
		--RyomaUp = 20
		elseif Name == "Korekiyo" then 
		PlayerName = "Корекиё Шингуджи"
		ScaleSize = 1.03
		updown = 0.5
		elseif Name == "Kyoko" then 
		PlayerName = "Кёко Киригири"
		updown = -2
		ScaleSize = 0.905
		elseif Name == "Leon" then 
		PlayerName = "Леон Кувата"
		updown = -2
		ScaleSize = 0.935
		elseif Name == "Mahiru"then 
		PlayerName = "Махиру Коидзуми"
		updown = -2
		ScaleSize = 0.935
		elseif Name == "Maki" then 
		PlayerName = "Маки Харукава"
		updown = -3
		ScaleSize = 0.99
		elseif Name == "Mikan" then 
		PlayerName = "Микан Цумики"
		updown = -2
		ScaleSize = 0.91
		elseif Name == "Miu" then 
		PlayerName = "Миу Ирума"
		updown = -2
		ScaleSize = 0.98
		elseif Name == "Mondo" then 
		PlayerName = "Мондо Овада"
		ScaleSize = 0.93
		elseif Name =="Monokuma" then 
		PlayerName = "Монокума"
		updown = -18
		elseif Name == "Nagito" then 
		PlayerName = "Нагито Комаеда"
		ScaleSize = 0.95
		updown = 1
		elseif Name == "Nekomaru" then 
		PlayerName = "Некомару Нидай"
		updown = 2
		ScaleSize = 1.033
		HifumiScale = 1.05
		elseif Name == "Peko" then 
		PlayerName = "Пеко Пекояма"
		updown = -1
		ScaleSize = 0.92
		elseif Name == "Rantaro" then 
		PlayerName = "Рантаро Амами"
		updown = -1
		ScaleSize = 0.995
		elseif Name == "Ryoma" then 
		PlayerName = "Рёма Хоши"
		updown = -15
		ScaleSize = 0.95
		RyomaUp = 20
		elseif Name == "Sakura" then 
		PlayerName = "Сакура Огами"
		updown = 1
		ScaleSize = 0.92
		HifumiScale = 1.2
		elseif Name == "Sayaka" then 
			updown = -1.5
			ScaleSize = 0.9
		PlayerName = "Саяка Майзоно"
		elseif Name == "Shuichi" then 
		PlayerName = "Шуичи Сайхара"
		updown = -2
		ScaleSize = 0.97
		elseif Name == "Sonia" then 
		PlayerName = "Сония Невермайнд"
		updown = -1
		ScaleSize = 0.905
		elseif Name == "Tenko" then 
		PlayerName = "Тенко Чабашира"
		updown = -2
		ScaleSize = 1.01
		elseif Name == "Teruteru" then 
		PlayerName = "Терутеру Ханамура"
		updown = -6
		ScaleSize = 0.9
		elseif Name == "Toko" then 
		PlayerName = "Токо Фукава"
		updown = -2
		ScaleSize = 0.92
		elseif Name == "Tsumugi" then 
		PlayerName = "Цумуги Широгане"
		updown = -1
		ScaleSize = 0.99
		elseif Name == "Yasuhiro" then 
		PlayerName = "Ясухиро Хагакуре"
		updown = 1
		ScaleSize = 1.01
		elseif Name == "Emma" then 
		PlayerName = "Эмма Магороби"
		updown = -1
		ScaleSize = 0.945
		elseif Name == "Shobai" then 
		PlayerName = "Шобай Хашимото"
		updown = -1
		ScaleSize = 0.89
		elseif Name == "Hibiki" then 
		PlayerName = "Хибики Отонокоджи"
		updown = -4
		ScaleSize = 0.89
		elseif Name == "Iroha" then 
		PlayerName = "Ироха Ниджиуэ"
		updown = -5
		ScaleSize = 0.885
		elseif Name == "Kanade" then 
		PlayerName = "Канаде Отонокоджи"
		updown = -4
		ScaleSize = 0.89
		elseif Name == "Kokoro" then 
		PlayerName = "Кокоро Митсуме"
		updown = -3.5
		ScaleSize = 0.92
		elseif Name == "Makunouchi" then 
		PlayerName = "Хаджиме Макуноучи"
		updown = -1.5
		ScaleSize = 0.92
		elseif Name == "Mikado" then 
		PlayerName = "Микадо Санноджи"
		ScaleSize = 0.93
		elseif Name == "Nikei" then 
		PlayerName = "Никей Йомиури"
		updown = -1.5
		ScaleSize = 0.92
		elseif Name == "Setsuka" then 
		PlayerName = "Сетсука Чибукуро"
		updown = -2
		ScaleSize = 0.94
		elseif Name == "Shinji" then 
		PlayerName = "Шинджи Касай"
		ScaleSize = 0.985
		elseif Name == "Teruya" then 
		PlayerName = "Теруя Отори"
		updown = 2.5
		ScaleSize = 1.02
		elseif Name == "Yoruko" then 
		PlayerName = "Йоруко Кабуя"
		updown = -3.5
		ScaleSize = 0.92
		elseif Name == "Yuki" then 
		PlayerName = "Юки Маеда"
		updown = -2
		ScaleSize = 0.94
		elseif Name == "Sora" then 
		PlayerName = "Сора"
		updown = -2
		ScaleSize = 0.92
		elseif Name == "Yuri" then 
		PlayerName = "Юри Кагарин"
		updown = -5
		ScaleSize = 0.87
		elseif Name == "Ayumu" then 
		PlayerName = "Аюму Фуджимори"
		updown = -3
		ScaleSize = 0.81
		elseif Name == "Akira" then 
		PlayerName = "Акира Цучия"
		ScaleSize = 0.84
		updown = -1.5
		elseif Name == "Aruma" then 
		PlayerName = "Арума Тодороки"
		updown = -2
		ScaleSize = 0.88
		elseif Name == "Kasumi" then 
		PlayerName = "Касуми Изумо"
		updown = -3
		ScaleSize = 0.93
		elseif Name == "Kazuomi" then 
		PlayerName = "Казуоми Самеджима"
		updown = -3
		ScaleSize = 0.88
		elseif Name == "Kego" then 
		PlayerName = "Кего Сакума"
		updown = -16
		ScaleSize = 0.81
		RyomaUp = 20
		elseif Name == "Maiko" then 
		PlayerName = "Майко Кагура"
		updown = -3.5
		ScaleSize = 0.875
		elseif Name == "Mikoto" then
        PlayerName = "Микото Итсуки"
        updown = -3
        ScaleSize = 0.895
        elseif Name == "Seishi" then 
		PlayerName = "Сейши Йодогава"
		updown = 1
		ScaleSize = 0.91
		elseif Name == "Misuzu" then 
		PlayerName = "Мисузу Айсака"
		updown = -3
		ScaleSize = 0.905
		elseif Name == "Mitsunari" then 
		PlayerName = "Мицунари Кога"
		updown = 1
		ScaleSize = 0.895
		elseif Name == "Narumi" then 
		PlayerName = "Наруми Осоне"
		updown = -5.5
		ScaleSize = 0.84
		elseif Name == "Saiji" then 
		PlayerName = "Сайджи Рокудо"
		updown = -1
		ScaleSize = 0.885
		elseif Name == "Marin" then 
		PlayerName = "Марин Мизута"
		ScaleSize = 0.85
		updown = -4
        elseif Name == "Nico" then 
		PlayerName = "Нико Химуро"
		ScaleSize = 0.845
		updown = -4
        elseif Name == "Ryota" then 
		PlayerName = "Рёта Митарай"
		ScaleSize = 0.93
		updown = -4
        elseif Name == "Ryoko" then 
		PlayerName = "Рёко Отонаши"
		ScaleSize = 0.975
		updown = -3
        elseif Name == "Komaru" then 
		PlayerName = "Комару Наеги"
		ScaleSize = 0.97
		updown = -4
		elseif Name == "Seiko" then 
		PlayerName = "Сейко Кирума"
		ScaleSize = 0.895
		updown = -4
        elseif Name == "Chinami" then 
		PlayerName = "Чинами Хасами"
		elseif Name == "Misako" then 
		PlayerName = "Мисако Рокухана"
		elseif Name == "Min" then 
		PlayerName = "Мин Чжун"
		elseif Name == "Maru" then 
		PlayerName = "Йококуме Мару"
		elseif Name == "Madoka" then 
		PlayerName = "Мадока Комаэда"
            elseif Name == "Joe" then 
		PlayerName = "Кохэку Сано"
            elseif Name == "Sora" then 
		PlayerName = "Нори Уэмура"
            elseif Name == "Seyeri" then 
		PlayerName = "Сэйери Тамура"
            elseif Name == "Maemi" then 
		PlayerName = "Маэми Киносита"
            elseif Name == "Masahiro" then 
		PlayerName = "Масахиро Гото"
            elseif Name == "Kiku" then 
		PlayerName = "Кику Ёсида"
            elseif Name == "Chieko" then 
		PlayerName = "Чиеко Хирата"
            elseif Name == "Yukayo" then 
		PlayerName = "Юкайо Танигути"
            elseif Name == "Mamoru" then 
		PlayerName = "Мамору Нисида"
            elseif Name == "Kadzumi" then 
		PlayerName = "Кадзуми Ивамото"
            elseif Name == "Harumi" then 
		PlayerName = "Харуми Фудзивара"
            elseif Name == "Mariko" then 
		PlayerName = "Марико Ватанабэ"
            elseif Name == "Akeno" then 
		PlayerName = "Акено Минами"
            elseif Name == "Takudzi" then 
		PlayerName = "Такудзи Отонаши"
            elseif Name == "Mikasa" then 
		PlayerName = "Микаса Сайонджи"
            elseif Name == "Kaoru" then 
		PlayerName = "Каору Амаги"
            elseif Name == "Medako" then 
		PlayerName = "Медако Макасубе"
            elseif Name == "Reimondas" then 
		PlayerName = "Реймондас Деметис"
            elseif Name == "Naruki" then 
		PlayerName = "Наруки Исаму"
            elseif Name == "Мисаки Хомма" then 
		PlayerName = "Misaki"
        elseif Name == "Йоши Симудзу" then 
		PlayerName = "Yoshi"
		elseif Name == "Нана Игараси" then 
		PlayerName = "Nana"
		elseif Name == "Шу Ямамото" then 
		PlayerName = "Shu"
		elseif Name == "Рюдзи Гото" then 
		PlayerName = "Ryuuji"
		elseif Name == "Кохару Китамура" then 
		PlayerName = "Koharu"
		elseif Name == "Йоширо Тогучи" then 
		PlayerName = "Yoshiro"
		elseif Name == "Аюми Хирано" then 
		PlayerName = "Ayumi"
        elseif Name == "Хидеки Такада" then 
		PlayerName = "Hideki"
		elseif Name == "Кермит Невилл" then 
		PlayerName = "Kermit"
        elseif Name == "Хидеёси Сигуяма" then 
		PlayerName = "Hideyoshi"
        elseif Name == "Мари Цудзи" then 
		PlayerName = "Mari"
        elseif Name == "Торо Хаттори" then 
		PlayerName = "Toro"
		elseif Name == "Сецуко Хиросэ" then 
		PlayerName = "Setsuko"
        elseif Name == "Йоко Нагата" then 
		PlayerName = "Yoko"
        elseif Name == "Рикуто Минами" then 
		PlayerName = "Rikuto"
        elseif Name == "Кокоро Курокава" then 
		PlayerName = "Kurokawa"
        elseif Name == "Чиса Юкизоме" then 
		PlayerName = "Chisa"
        elseif Name == "Вероника Гребенщикова" then 
		PlayerName = "Veronika"
        elseif Name == "Монофрог" then 
		PlayerName = "Monofrog"
        elseif Name == "Риана Юи" then 
		PlayerName = "Riana"
        elseif Name == "Pocket" then 
		PlayerName = "Покет"
		ScaleSize = 0.91
		updown = -1
        elseif Name == "Grisp" then 
		PlayerName = "Грисп"
		ScaleSize = 0.985
		updown = 2
        elseif Name == "Cross" then 
		PlayerName = "Кросс"
		ScaleSize = 0.90
		updown = 0.5
        elseif Name == "Enigma" then 
		PlayerName = "Энигма"
		ScaleSize = 0.90
		updown = -1.5
        elseif Name == "Anon" then 
		PlayerName = "Анон"
		ScaleSize = 0.895
		updown = -2
        elseif Name == "Moraiteru" then 
		PlayerName = "Мораитеру"
		ScaleSize = 0.87
		updown = -4.5
        elseif Name == "Yaxi" then 
		PlayerName = "Якси"
		ScaleSize = 0.89
		updown = -2.75
        elseif Name == "Rock" then 
		PlayerName = "Рок"
		ScaleSize = 0.88
		updown = -3
        elseif Name == "Rox" then 
		PlayerName = "Рокс"
		ScaleSize = 0.89
		updown = -2.5
        elseif Name == "Rissi" then 
		PlayerName = "Рисси"
		ScaleSize = 0.91
		updown = -5
        elseif Name == "Scarlet" then 
		PlayerName = "Скарлет"
		ScaleSize = 0.88
		updown = -3
        elseif Name == "Twin" then 
		PlayerName = "Твин"
		ScaleSize = 0.89
		updown = -2
        elseif Name == "Cancel" then 
		PlayerName = "Канцел"
		ScaleSize = 0.91
		updown = -3
        elseif Name == "Corza" then 
		PlayerName = "Корза"
		ScaleSize = 0.96
		updown = 0.5
        elseif Name == "Arei" then 
		PlayerName = "Арей"
		ScaleSize = 0.90
        updown = -2

        elseif Name == "Damon" then 
		PlayerName = "Деймон Майтсу"
		ScaleSize = 0.79
		HifumiScale = 0.48
		elseif Name == "Toshiko" then 
		PlayerName = "Тошико Каюра"
		ScaleSize = 0.66
		HifumiScale = 0.45
		elseif Name == "Wolfgang" then 
		PlayerName = "Вольфганг Акире"
		ScaleSize = 0.79
		HifumiScale = 0.39
		elseif Name == "Eva" then 
		PlayerName = "Ева Тсунака"
		ScaleSize = 0.75
		HifumiScale = 0.53
		elseif Name == "Diana" then 
		PlayerName = "Диана Вениция"
		ScaleSize = 0.74
		HifumiScale = 0.55
		elseif Name == "Kai" then 
		PlayerName = "Кай Монтеаго"
		ScaleSize = 0.77
		HifumiScale = 0.52
		elseif Name == "Cassidy" then 
		PlayerName = "Кэсседи Эмбер"
		ScaleSize = 0.71
		HifumiScale = 0.43
		elseif Name == "Jean" then 
		PlayerName = "Жан Дэламер"
		ScaleSize = 0.87
		HifumiScale = 1.0
		elseif Name == "Ingrid" then 
		PlayerName = "Ингрид Гримвалл"
		ScaleSize = 0.79
		HifumiScale = 0.60
		elseif Name == "Jett" then 
		PlayerName = "Джетт Даусон"
		ScaleSize = 0.77
		HifumiScale = 0.55
		elseif Name == "Wenona" then 
		PlayerName = "Венона"
		ScaleSize = 0.73
		HifumiScale = 0.59
		elseif Name == "Ulysses" then 
		PlayerName = "Улисс Вильгельм"
		ScaleSize = 0.72
		HifumiScale = 0.45
		elseif Name == "Eloise" then 
		PlayerName = "Элоиз Таулнер"
		ScaleSize = 0.88
		HifumiScale = 1.0
		elseif Name == "Desmond" then 
		PlayerName = "Дезмонд Холл"
		ScaleSize = 0.77
		HifumiScale = 0.45
		elseif Name == "Grace" then 
		PlayerName = "Грейс Мэдисон"
		ScaleSize = 0.77
		HifumiScale = 0.48
		elseif Name == "Mayhem" then 
		PlayerName = "Марк Берский"
		ScaleSize = 0.77
		HifumiScale = 0.43

		elseif Name == "Shusha" then 
		PlayerName = "Шуичи Сайхара"
		ScaleSize = 0.94
		HifumiScale = 0.88

		elseif Name == "Charon" then 
		PlayerName = "Кэрон Шиока"
		ScaleSize = 0.69
		HifumiScale = 0.71
		elseif Name == "Wrench" then 
		PlayerName = "Реджинальд Блэкмен"
		ScaleSize = 0.69
		HifumiScale = 0.71
		elseif Name == "Yukio" then 
		PlayerName = "Юкио Такэда"
		ScaleSize = 0.74
		HifumiScale = 0.71
		elseif Name == "Arizu" then 
		PlayerName = "Ари"
		ScaleSize = 0.68
		HifumiScale = 0.66
		elseif Name == "Chesed" then 
		PlayerName = "Хесед"
		ScaleSize = 0.77
		HifumiScale = 0.52
		elseif Name == "Ramble" then 
		PlayerName = "Рамбл Тауэ"
		ScaleSize = 0.70
		HifumiScale = 0.72
		elseif Name == "Hano" then 
		PlayerName = "Хано Хананокизу"
		ScaleSize = 0.84
		HifumiScale = 0.87
		elseif Name == "Haru" then 
		PlayerName = "Хару Такиби"
		ScaleSize = 0.94
		HifumiScale = 0.78
		elseif Name == "Ki Don Son" then 
		PlayerName = "Ки Дон Сон"
		ScaleSize = 0.82
		HifumiScale = 0.90
		elseif Name == "Dori" then 
		PlayerName = "Дори Мори"
		ScaleSize = 1.00
		HifumiScale = 1.00
		elseif Name == "Leonija" then 
		PlayerName = "Леонье Солгейм"
		ScaleSize = 1.00
		HifumiScale = 1.00
		elseif Name == "San Ho Son" then 
		PlayerName = "Сан Хо Сон"
		ScaleSize = 0.88
		HifumiScale = 0.88
		elseif Name == "Terumi" then 
		PlayerName = "Теруми Тодо"
		ScaleSize = 0.72
		HifumiScale = 0.71
		elseif Name == "Hitoshi" then 
		PlayerName = "Хитоши Нацуно"
		ScaleSize = 0.71
		HifumiScale = 0.57
		elseif Name == "Kitagawa" then 
		PlayerName = "Китагава"
		ScaleSize = 0.72
		HifumiScale = 0.49
   		

		end

    local tbl = {PlayerName, updown,ScaleSize,HifumiScale,RyomaUp}
    --print(PlayerName)
    --print(updown)
    --print(Name)
    return tbl
    end

function ENT:Think()

	if  SendedName ==  self:GetCharacterName() then
	mat[self] = "123"
	self:SetSpriteCount(SendedNumber)
	SendedName = ""
end
--[[if SendedNameForCamera == self:GetCharacterName() then
if SERVER then
	print (SendedNameForCamera)
	net.Start('GoCameraTo')	
	net.WriteEntity(self.camera)
	net.Broadcast()
	SendedNameForCamera = ""
end
end]]
--self:SetNWString("CharacterName", "hiyoko")
if self:GetCharacterName() == "" then

self:SetCharacterName(self:GetNWString("CharacterName"))
        local Name = self:GetCharacterName()
        local tbl = GetNameAndHeight(Name)
        
local PlayerName = tbl[1]
local updown = tbl[2]
local scaleSize = tbl[3]
local himumi = tbl[4]
local RyomaUp = tbl[5]
		self:SetPlayerName(PlayerName)
		self:SetSpriteSizeScale(scaleSize)
		self:SetHifumiSizeScale(himumi)
		if (RyomaUp~=0) then
			local stand = ents.Create("gmod_button")
			stand:SetModel("models/props/v3/ryomastand.mdl")
			stand:Spawn()
			stand:PhysWake()
			stand:SetAngles(self:GetAngles()+Angle(0,30,0))

			stand:SetPos(self:GetPos()-Vector(0,0,40))
			self:SetPos(self:GetPos()+Vector(0,0,RyomaUp))
			stand:SetParent(self)
		end





if(self:GetNWEntity("PlayerCameraPlace"):IsValid()) then
self:GetNWEntity("PlayerCameraPlace"):SetPos(self:GetNWEntity("PlayerCameraPlace"):GetPos()+Vector(0,0,updown*2))
end
if(self:GetNWEntity("PlayerCameraPlaceLeft"):IsValid()) then
self:GetNWEntity("PlayerCameraPlaceLeft"):SetPos(self:GetNWEntity("PlayerCameraPlaceLeft"):GetPos()+Vector(0,0,updown*2))
end
if(self:GetNWEntity("PlayerCameraPlaceRight"):IsValid()) then
self:GetNWEntity("PlayerCameraPlaceRight"):SetPos(self:GetNWEntity("PlayerCameraPlaceRight"):GetPos()+Vector(0,0,updown*2))
end
if(self:GetNWEntity("PlayerCameraPlaceLong"):IsValid()) then
self:GetNWEntity("PlayerCameraPlaceLong"):SetPos(self:GetNWEntity("PlayerCameraPlaceLong"):GetPos()+Vector(0,0,updown*2))
end
if(self:GetNWEntity("PlayerCameraPlaceNear"):IsValid()) then
self:GetNWEntity("PlayerCameraPlaceNear"):SetPos(self:GetNWEntity("PlayerCameraPlaceNear"):GetPos()+Vector(0,0,updown*2))
end
if(self:GetNWEntity("PlayerCameraPlaceDown"):IsValid()) then
self:GetNWEntity("PlayerCameraPlaceDown"):SetPos(self:GetNWEntity("PlayerCameraPlaceDown"):GetPos()+Vector(0,0,updown*2))
end
if(self:GetNWEntity("PlayerCameraPlaceUp"):IsValid()) then
self:GetNWEntity("PlayerCameraPlaceUp"):SetPos(self:GetNWEntity("PlayerCameraPlaceUp"):GetPos()+Vector(0,0,updown*2))
end


self:SetCollisionGroup(20)

end

if _cam == self:GetNWEntity("PlayerCamera") then
	if _camplace ~= self:GetNWEntity("PlayerCameraPlace") then
	_camplace = self:GetNWEntity("PlayerCameraPlace")
	_camleft = self:GetNWEntity("PlayerCameraPlaceLeft")
	_camright = self:GetNWEntity("PlayerCameraPlaceRight")
	_camup = self:GetNWEntity("PlayerCameraPlaceUp")
	_camdown = self:GetNWEntity("PlayerCameraPlaceDown")
	_camnear = self:GetNWEntity("PlayerCameraPlaceNear")
	_camlong = self:GetNWEntity("PlayerCameraPlaceLong")
	end
	
end

end




local CameraAnimationNumber = 0
local globCam = nil
local charCameras = {}
if SERVER then
	util.AddNetworkString("StartCameraAnimation")
	util.AddNetworkString("StartCameraAnimation2")
	util.AddNetworkString("SendGlobalCamera")
	util.AddNetworkString("SendCharCamera")
	util.AddNetworkString("RestartCharCameras")

	net.Receive("SendGlobalCamera", function ()
		globCam = net.ReadEntity()
		_globalcamera = globCam
	end)

	net.Receive("SendCharCamera", function ()
		local charCam = net.ReadEntity()
		if(charCam:GetNWString("CharacterName")!="") then
			charCameras[charCam:GetNWString("CharacterName")] = charCam
		end
	end)

	net.Receive("RestartCharCameras", function ()
		charCameras = {}
	end)
end
	


local single1 = true
net.Receive("StartCameraAnimation", function ()
	if single1 == true then
		single1 = false
           
    timer.Simple(0.1, function () end)
            
	local tbl = net.ReadTable()
	_cam = charCameras[tbl[1]]

	if(tbl[2]) then
	    net.Start("Objection2")
		net.WriteString(_cam:GetNWString("CharacterName"))
		net.Broadcast()
        net.Start("SendGlobalCameraMove")
	 	net.WriteEntity(_cam)
		net.Broadcast()
    else 
        net.Start("SendGlobalCameraMove")
	 	net.WriteEntity(_cam)
		net.Broadcast()    
	end

	net.Start("SendGlobalCameraMove")
	 net.WriteEntity(_cam)
	 net.Broadcast()

	net.Start("SendName2")
	 net.WriteString(tbl[1])
	 net.Broadcast()

	net.Start("SendSoundNumber2")
    net.WriteFloat(tbl[4])
    net.Broadcast()
            
    CameraAnimationNumber = tbl[3]
timer.Simple(0.3, function ()

local count = 1
	if CameraAnimationNumber == 0 or CameraAnimationNumber == 1 then
	count = math.random(1,1)
	elseif CameraAnimationNumber == 2 then
		count = math.random(2,7)
		elseif CameraAnimationNumber == 3 then
		count = math.random(16,27)
		elseif CameraAnimationNumber == 4 then
		count = math.random(8,11)
		elseif CameraAnimationNumber == 5 then
		count = math.random(12,15)
end
                    local scaler = 3
	_cam:SetAngles(Angle(_cam:GetAngles().X,_cam:GetAngles().Y,0))
			if count == 1 then
			Animate(_cam, _camplace:GetPos(), _camplace:GetPos(), 1)
			elseif count == 2 then
			Animate(_cam, _camdown:GetPos(), _camplace:GetPos(), 1)
			elseif count == 3 then
			Animate(_cam, _camup:GetPos(), _camplace:GetPos(), 1)
			elseif count == 4 then
			Animate(_cam, _camleft:GetPos(), _camplace:GetPos(), 1)
			elseif count == 5 then
			Animate(_cam, _camright:GetPos(), _camplace:GetPos(), 1)
			elseif count == 6 then
			Animate(_cam, _camnear:GetPos(), _camplace:GetPos(), 1)
			elseif count == 7 then
			Animate(_cam, _camlong:GetPos(), _camplace:GetPos(), 1)

			elseif count == 8 then
			AnimateRotation(_cam, _camlong:GetPos(), _camplace:GetPos(), 1,90/scaler,4*scaler)
			elseif count == 9 then
			AnimateRotation(_cam, _camlong:GetPos(), _camplace:GetPos(), 1,-90/scaler,4*scaler)
			elseif count == 10 then
			AnimateRotation(_cam, _camnear:GetPos(), _camplace:GetPos(), 1,90/scaler,4*scaler)
			elseif count == 11 then
			AnimateRotation(_cam, _camnear:GetPos(), _camplace:GetPos(), 1,-90/scaler,4*scaler)

			elseif count == 12 then
			AnimateRotation(_cam, _camlong:GetPos(), _camplace:GetPos(), 1,180/scaler,2*scaler)
			elseif count == 13 then
			AnimateRotation(_cam, _camlong:GetPos(), _camplace:GetPos(), 1,-180/scaler,2*scaler)
			elseif count == 14 then
			AnimateRotation(_cam, _camnear:GetPos(), _camplace:GetPos(), 1,180/scaler,2*scaler)
			elseif count == 15 then
			AnimateRotation(_cam, _camnear:GetPos(), _camplace:GetPos(), 1,-180/scaler,2*scaler)


			elseif count == 16 then
			AnimateRotation(_cam, _camnear:GetPos(), _camplace:GetPos(), 1,6,1)
			elseif count == 17 then
			AnimateRotation(_cam, _camnear:GetPos(), _camplace:GetPos(), 1,-6,1)
			elseif count == 18 then
			AnimateRotation(_cam, _camdown:GetPos(), _camplace:GetPos(), 1,6,1)
			elseif count == 19 then
			AnimateRotation(_cam, _camdown:GetPos(), _camplace:GetPos(), 1,-6,1)
			elseif count == 20 then
			AnimateRotation(_cam, _camup:GetPos(), _camplace:GetPos(), 1,6,1)
			elseif count == 21 then
			AnimateRotation(_cam, _camup:GetPos(), _camplace:GetPos(), 1,-6,1)
			elseif count == 22 then
			AnimateRotation(_cam, _camleft:GetPos(), _camplace:GetPos(), 1,6,1)
			elseif count == 23 then
			AnimateRotation(_cam, _camleft:GetPos(), _camplace:GetPos(), 1,-6,1)
			elseif count == 24 then
			AnimateRotation(_cam, _camright:GetPos(), _camplace:GetPos(), 1,6,1)
			elseif count == 25 then
			AnimateRotation(_cam, _camright:GetPos(), _camplace:GetPos(), 1,-6,1)
			elseif count == 26 then
			AnimateRotation(_cam, _camlong:GetPos(), _camplace:GetPos(), 1,6,1)
			elseif count == 27 then
			AnimateRotation(_cam, _camlong:GetPos(), _camplace:GetPos(), 1,-6,1)

	end
	

	end)
        if(tbl[2]) then
            timer.Simple(10, function ()
                single1 = true
            end)
        else 
            timer.Simple(5, function ()
                single1 = true
            end) 
        end
	end
	end)
local i = -100;
local j = -100;
function ENT:Draw()
		local localw = _w*self:GetSpriteSizeScale()*self:GetHifumiSizeScale()
	local localh = _h*self:GetSpriteSizeScale()
	--[[if (SERVER)then
	local SelfName = self:GetCharacterName()
	local SelfNumber = self:GetSpriteCount()
	AddCSLuaFile("Colored/"..SelfName.."/"..SelfName.."_"..SelfNumber)
	AddCSLuaFile("Black/"..SelfName.."/"..SelfName.."_"..SelfNumber)
end]]
	
--print (SendedNameForCamera)
--print (self:GetCharacterName())
self:DrawModel()
if (IsShow == true) then
local ang = self:GetAngles()
ang:RotateAroundAxis(self:GetAngles():Right(), 90)
ang:RotateAroundAxis(self:GetAngles():Forward(), 90)
local SelfName = self:GetCharacterName()
local SelfNumber = self:GetSpriteCount()
--[[cam.Start3D2D(self:GetPos()+Vector(-0.5,-0.5,0),ang, 0.1)
surface.SetMaterial(Material("Black/"..SelfName.."/"..SelfName.."_"..SelfNumber))
surface.SetDrawColor(255,0,0,100)
surface.DrawTexturedRect(-localw/2, -localh+10, localw, localh)
cam.End3D2D()]]
        
if mat[self] == "123" or mat[self] == nil or mat[self]:IsError() then
	if !Material(SelfName.."/"..SelfNumber..".png","noclamp smooth"):IsError() then
		mat[self] = Material(SelfName.."/"..SelfNumber..".png","noclamp smooth")
	end            
end
cam.Start3D2D(self:GetPos()+Vector(0,0,-40),ang, 0.1)
if(!isstring(mat[self])) then
	surface.SetMaterial(mat[self])
end
                surface.SetDrawColor(Color(255,255,255,255))
surface.DrawTexturedRect(0-localw/2, -localh+110, localw, localh)
cam.End3D2D()
ang:RotateAroundAxis(Vector(0,0,90), 180)
cam.Start3D2D(self:GetPos()+Vector(0,0,-40),ang, 0.1)
        if(!isstring(mat[self])) then
			surface.SetMaterial(mat[self])
        end
                surface.SetDrawColor(Color(255,255,255,255))
surface.DrawTexturedRect(0-localw/2, -localh+110, localw, localh)
cam.End3D2D()

--[[cam.Start3D2D(self:GetPos()+Vector(0,0,0),ang + Angle(-i,-i*4,i+180), 0.1)
	draw.SimpleTextOutlined("Я пидарас!!!!","Белый Шум",i,0, Color(230,107,233,255),TEXT_ALIGN_CENTER,TEXT_ALIGN_CENTER,1,Color( 62, 0, 47, 255 ))
cam.End3D2D()
cam.Start3D2D(self:GetPos()+Vector(0,0,0),ang + Angle(-i,-i*4,i), 0.1)
	draw.SimpleTextOutlined("Я пидарас!!!!","Белый Шум",i,0, Color(230,107,233,255),TEXT_ALIGN_CENTER,TEXT_ALIGN_CENTER,1,Color( 62, 0, 47, 255 ))
cam.End3D2D()
i = i + 0.1
if i > 200 then
	i = -200
end]]


--ang:RotateAroundAxis(Vector(0,0,90), 180)
--cam.Start3D2D(self:GetPos()+Vector(0,0,-40),ang, 0.1)
--surface.SetDrawColor(255,255,255,255)
--if !Material(SelfName.."/"..SelfNumber):IsError() then
        --surface.SetMaterial(Material(SelfName.."/"..SelfNumber))
            --else
            --surface.SetMaterial(mat[self])
            --end
--surface.DrawTexturedRect(0-localw/2, -localh+110, localw, localh)
--cam.End3D2D()
       
end
local dist = LocalPlayer():GetPos():Distance(self:GetPos())
local distofvision = 1000
 if self:GetPlayerName() == LocalPlayer():Name() and (dist < distofvision) then
            if (LocalPlayer():GetPos():Distance(self:GetPos()) > 70) then
        local pos = self:GetPos()
                pos.z = pos.z
        pos:ToScreen()
        cam.Start2D()
        pos = pos:ToScreen()
        surface.SetMaterial(Material("sprites/ui/world/your place"))
        surface.SetDrawColor(Color(255,255,255,255))
        surface.DrawTexturedRect(pos.x - 100 * (1 - dist/distofvision),pos.y,200*(1 - dist/distofvision),20*(1 - dist/distofvision))
        cam.End2D()
end
            end
end