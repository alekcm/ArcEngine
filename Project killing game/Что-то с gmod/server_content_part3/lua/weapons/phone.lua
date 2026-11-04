if SERVER then
	AddCSLuaFile()
	util.AddNetworkString('OpenPhone')
end

SWEP.PrintName			= "Телефон"
SWEP.Author				= "DDF"
SWEP.Instructions				= "ЛКМ - открыть монопад"
SWEP.Spawnable				= true
SWEP.Category				= "DDF"

SWEP.Slot = 2 

SWEP.ViewModel			= Model('models/elysion/c_phone_model.mdl')
SWEP.WorldModel			= Model('models/elysion/w_phone_model.mdl') 
SWEP.ViewModelFOV = 54
SWEP.UseHands = true

SWEP.AnimPrefix	 		= "rpg"

SWEP.IsPicking 	= false
SWEP.PickTime = 15

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



function SWEP:Initialize()
	self.onHands = true
	self.Time = 0
	self.Range = 150
	self:SetHoldType( "normal" )
	if(SERVER) then
		self:SetNWString("OwnerMonopad", "")
	end
	--print("hi")
	
	--local VM = self.Owner:GetViewModel()
	--self.ViewModel = Model( "models/dff/c_key_card.mdl" )
	--self.Weapon:SetWeaponModel("models/dff/c_key_card.mdl", self)
end

function SWEP:PrimaryAttack(right)
	--self.Weapon:SetNWBool("RemoveMonopad", false)

	self:SetHoldType( "camera" )

end




if SERVER then

end

print("Телефон поменяли")