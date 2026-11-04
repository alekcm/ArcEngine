if SERVER then
	AddCSLuaFile()
end

SWEP.PrintName			= "Фонарик"
SWEP.Author				= "DDF"
SWEP.Instructions				= "ЛКМ - включить\nПКМ - выключить"
SWEP.Spawnable				= true
SWEP.Category				= "DDF"

SWEP.Slot = 3 

SWEP.ViewModel			= "models/weapons/c_flashlight_zm.mdl"
SWEP.WorldModel			= "models/weapons/w_flashlight_zm.mdl"

SWEP.ViewModelFOV = 54
SWEP.UseHands = true

SWEP.AnimPrefix	 		= "rpg"

SWEP.Primary.ClipSize		= -1
SWEP.Primary.DefaultClip	= -1
SWEP.Primary.Automatic		= false
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
	surface.SetMaterial( Material("weaponicon/flashlight.png" ))
	
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
	self:SetHoldType( "slam" )
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
if SERVER then
--GM:PlayerSwitchWeapon( Player player, Weapon oldWeapon, Weapon newWeapon )
hook.Add( "PlayerSwitchWeapon", "RemoveFlashlight", function( ply, oldWeapon, newWeapon )
	if (ply:FlashlightIsOn()) then
		ply:Flashlight( false )
	end
end)


function SWEP:PrimaryAttack()
	if (!self.Owner:FlashlightIsOn()) then
self.Owner:Flashlight( true )
else
	return false
end
end

function SWEP:SecondaryAttack()
	if (self.Owner:FlashlightIsOn()) then
self.Owner:Flashlight( false )
else
	return false
end
end

end
if CLIENT then
	function SWEP:PrimaryAttack()
end

function SWEP:SecondaryAttack()
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
