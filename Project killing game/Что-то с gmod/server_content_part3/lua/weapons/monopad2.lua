if SERVER then
	AddCSLuaFile()
end

SWEP.PrintName			= "Монопад2"
SWEP.Author				= "DDF"
SWEP.Instructions				= "ЛКМ - открыть монопад"
SWEP.Spawnable				= false
SWEP.Category				= "DDF"

SWEP.Slot = 2 

SWEP.ViewModel			= "models/ddf/monopad.mdl"
SWEP.WorldModel			= "models/ddf/monopad_world.mdl" 
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

--local chars = {["Makoto"] = "Макото Наеги",["Aoi"] = "Аой Асахина",["Byakuya"] = "Бьякуя Тогами",["Celestia"] = "Селестия Люденберг",["Chihiro"] = "Чихиро Фуджисаки",["Hifumi"] = "Хифуми Ямада",["Junko"] = "Джунко Эношима",["Kiyotaka"] = "Киётака Ишимару",["Kyoko"] = "Кёко Киригири",["Mondo"] = "Мондо Овада",["Leon"] = "Леон Кувата",["Mukuro"] = "Мукуро Икусаба",["Sakura"] = "Сакура Огами",["Sayaka"] = "Саяка Майзоно",["Toko"] = "Токо Фукава",["Yasuhiro"] = "Ясухиро Хагакуре",["Hajime"] = "Хаджиме Хината",["Akane"] = "Акане Овари",["Imposter"] = "Бьякуя Тогами",["Chiaki"] = "Чиаки Нанами",["Fuyuhiko"] = "Фуюхико Кузурю",["Gundham"] = "Гандам Танака",["Hiyoko"] = "Хиёко Сайонджи",["Ibuki"] = "Ибуки Миода",["Kazuichi"] = "Казуичи Сода",["Mahiru"] = "Махиру Коидзуми",["Mikan"] = "Микан Тсумики",["Nagito"] = "Нагито Комаеда",["Nekomaru"] = "Некомару Нидай",["Peko"] = "Пеко Пекояма",["Sonia"] = "Сония Невермайнд",["Teruteru"] = "Терутеру Ханамура",["Rantaro"] = "Рантаро Амами",["Kaede"] = "Каедэ Акаматсу",["Angie"] = "Анджи Йонага",["Gonta"] = "Гонта Гокухара",["Himiko"] = "Химико Юмено",["k1-b0"] = "K1-B0",["Kaito"] = "Кайто Момота",["Kirumi"] = "Кируми Тоджо",["Kokichi"] = "Кокичи Ома",["Korekiyo"] = "Корекиё Шингуджи",["Maki"] = "Маки Харукава",["Miu"] = "Миу Ирума",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами"}


function SWEP:Initialize()
	self.onHands = true
	self.Time = 0
	self.Range = 150
	self:SetHoldType( "camera" )
	--local VM = self.Owner:GetViewModel()
	--self.ViewModel = Model( "models/dff/c_key_card.mdl" )
	--self.Weapon:SetWeaponModel("models/dff/c_key_card.mdl", self)
end

function SWEP:SecondaryAttack()
	--self.Weapon:SetModel("models/ddf/monopad_world.mdl")
	--self.Weapon:SetWeaponModel("models/ddf/monopad_world.mdl", self.Weapon)
	--print(self.Weapon:GetModel())
	--self.Owner:GetViewModel():SetWeaponModel("models/ddf/monopad_world.mdl", self)
	--"models/ddf/monopad_world2.mdl" 
	--SWEP.WorldModel = "models/ddf/monopad_world2.mdl" 
	self.Owner:Give("monopad",false)
	self.Owner:StripWeapon("monopad2")
--self:SetHoldType( "normal" )
end

function SWEP:PrimaryAttack(right)
	--self.Weapon:SetModel("models/ddf/monopad_world2.mdl")
	--self.Weapon:SetWeaponModel("models/ddf/monopad_world2.mdl", self.Weapon)
	--print(self.Weapon:GetModel())
	--SWEP.WorldModel	= "models/ddf/monopad_world2.mdl" 
	--self.Owner:GetViewModel():SetWeaponModel("models/ddf/monopad_world2.mdl", self)
--self:SetHoldType( "camera" )
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
