if SERVER then
	AddCSLuaFile()
end

SWEP.PrintName			= "Руки"
SWEP.Author				= "Recon"
SWEP.Purpose				= "Not much."
SWEP.Spawnable				= true
SWEP.Category				= "DDF"

SWEP.ViewModel			= Model("models/weapons/c_arms.mdl")
SWEP.WorldModel			= ""
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

local SwingSound = Sound( "WeaponFrag.Throw" )
local HitSound = Sound( "Flesh.ImpactHard" )

local onHands = true
local damageCharacters = {}
damageCharacters["Макото Наеги"] = {7,11}
damageCharacters["Аой Асахина"] = {12,16}
damageCharacters["Бьякуя Тогами"] = {12,16}
damageCharacters["Селестия Люденберг"] = {6,10}
damageCharacters["Чихиро Фуджисаки"] = {1,3}
damageCharacters["Хифуми Ямада"] = {7,11}
damageCharacters["Джунко Эношима"] = {7,11}
damageCharacters["Киётака Ишимару"] = {8,12}
damageCharacters["Кёко Киригири"] = {7,11}
damageCharacters["Леон Кувата"] = {12,16}
damageCharacters["Мондо Овада"] = {13,17}
damageCharacters["Сакура Огами"] = {19,25}
damageCharacters["Саяка Майзоно"] = {5,9}
damageCharacters["Токо Фукава"] = {9,13}
damageCharacters["Ясухиро Хагакурэ"] = {8,12}
damageCharacters["Мукуро Икусаба"] = {17,21}

damageCharacters["Хаджиме Хината"] = {9,13}
damageCharacters["Аканэ Овари"] = {16,19}
damageCharacters["Импостер"] = {7,11}
damageCharacters["Чиаки Нанами"] = {3,7}
damageCharacters["Фуюхико Кузурю"] = {7,11}
damageCharacters["Гандам Танака"] = {18,22}
damageCharacters["Хиёко Сайонджи"] = {2,6}
damageCharacters["Ибуки Миода"] = {6,10}
damageCharacters["Казуичи Сода"] = {9,13}
damageCharacters["Махиру Коизуми"] = {6,10}
damageCharacters["Микан Цумики"] = {6,10}
damageCharacters["Нагито Комаеда"] = {3,7}
damageCharacters["Нэкомару Нидай"] = {18,22}
damageCharacters["Пеко Пекояма"] = {15,19}
damageCharacters["Сония Невермайнд"] = {6,10}
damageCharacters["Терутеру Ханамура"] = {6,10}

damageCharacters["Шуичи Сайхара"] = {7,11}
damageCharacters["Каедэ Акамацу"] = {6,10}
damageCharacters["Анджи Йонага"] = {7,11}
damageCharacters["Гонта Гокухара"] = {19,25}
damageCharacters["Химико Юмено"] = {2,6}
damageCharacters["K1-B0"] = {5,9}
damageCharacters["Кайто Момота"] = {9,13}
damageCharacters["Кируми Тоджо"] = {14,18}
damageCharacters["Кокичи Ома"] = {8,11}
damageCharacters["Корекиё Шингуджи"] = {8,12}
damageCharacters["Маки Харукава"] = {17,21}
damageCharacters["Миу Ирума"] = {6,10}
damageCharacters["Рантаро Амами"] = {10,12}
damageCharacters["Цумуги Широгане"] = {6,10}
damageCharacters["Рёма Хоши"] = {11,15}
damageCharacters["Тенко Чабашира"] = {14,18}

damageCharacters["Сора"] = {13,17}
damageCharacters["Теруя Оотори"] = {9,13}
damageCharacters["Юки Маеда"] = {6,10}
damageCharacters["Шинджи Касай"] = {14,18}
damageCharacters["Кокоро Митсуме"] = {4,8}
damageCharacters["Сетсука Чибукуро"] = {7,11}
damageCharacters["Хибики Отонороджи"] = {5,9}
damageCharacters["Канаде Отонокоджи"] = {10,14}
damageCharacters["Эмма Магороби"] = {7,11}
damageCharacters["Никей Йомируи"] = {8,12}
damageCharacters["Микадо Санноджи"] = {8,12}
damageCharacters["Юри Кагарин"] = {13,17}
damageCharacters["Шобай Хашимото"] = {15,19}
damageCharacters["Йоруко Кабуя"] = {6,10}
damageCharacters["Хаджиме Макуноучи"] = {16,20}
damageCharacters["Ироха Ниджиуэ"] = {2,6}

damageCharacters["Нико Хмиуро"] = {3,7}
damageCharacters["Марин Мизута"] = {2,6}
damageCharacters["Аюму Фуджимори"] = {4,8}
damageCharacters["Сейши Йодогава"] = {17,22}
damageCharacters["Акира Цучия"] = {3,7}
damageCharacters["Арума Тодороки"] = {8,12}
damageCharacters["Касуми Изумо"] = {5,9}
damageCharacters["Казуоми Самеджима"] = {16,20}
damageCharacters["Кего Сакума"] = {6,10}
damageCharacters["Майко Кагура"] = {7,11}
damageCharacters["Микото Итсуки"] = {14,18}
damageCharacters["Мисузу Айсака"] = {6,10}
damageCharacters["Мицунари Кога"] = {16,20}
damageCharacters["Наруми Осоне"] = {3,7}
damageCharacters["Сайджи Рокудо"] = {6,10}

damageCharacters["Энигма"] = {8,12}
damageCharacters["Рокс"] = {6,10}
damageCharacters["Мораитеру"] = {6,10}
damageCharacters["Кросс"] = {8,12}
damageCharacters["Скарлет"] = {6,10}
damageCharacters["Покет"] = {14,16}
damageCharacters["Грисп"] = {13,17}
damageCharacters["Анон"] = {3,7}
damageCharacters["Якси"] = {16,20}
damageCharacters["Рок"] = {8,12}
damageCharacters["Рисси"] = {3,7}
damageCharacters["Канцел"] = {5,9}
damageCharacters["Твин"] = {7,11}
damageCharacters["Корза"] = {8,12}

damageCharacters["Рёта Митарай"] = {3,7}
damageCharacters["Рёко Отонаши"] = {7,11}
damageCharacters["Изуру Камукура"] = {100,101}
damageCharacters["Комару Наеги"] = {6,10}
damageCharacters["Сейко Кимура"] = {5,9}

function SWEP:Initialize()
	self:SetHoldType( "normal" )
	self.onHands = true
	self.Time = 0
	self.Range = 150
end

function SWEP:Holster()

	self:SetNextMeleeAttack( 0 )

	return true

end

function SWEP:SetupDataTables()
	self:NetworkVar( "Float", 0, "NextMeleeAttack" )
	self:NetworkVar( "Float", 1, "NextIdle" )
	self:NetworkVar( "Int", 2, "Combo" )
end

function SWEP:UpdateNextIdle()
	local VM = self.Owner:GetViewModel()
	self:SetNextIdle( CurTime() + VM:SequenceDuration() / VM:GetPlaybackRate() )

end

function SWEP:Think()
	if (self.onHands) then
		if self.Drag and (not self.Owner:KeyDown(IN_ATTACK) or not IsValid(self.Drag.Entity)) then
			self.Drag = nil
		end
	else
		local vm = self.Owner:GetViewModel()
		local curtime = CurTime()
		local idletime = self:GetNextIdle()

		if ( idletime > 0 && CurTime() > idletime ) then

			vm:SendViewModelMatchingSequence( vm:LookupSequence( "fists_idle_0" .. math.random( 1, 2 ) ) )

			self:UpdateNextIdle()

		end

		local meleetime = self:GetNextMeleeAttack()

		if ( meleetime > 0 && CurTime() > meleetime ) then

			self:DealDamage()

			self:SetNextMeleeAttack( 0 )

		end

		if ( SERVER && CurTime() > self:GetNextPrimaryFire() + 0.1 ) then

			self:SetCombo( 0 )

		end
	end
	
	if self.Owner:KeyPressed(IN_RELOAD)	and IsFirstTimePredicted() then
		self.onHands = !self.onHands
		local VM = self.Owner:GetViewModel()
		if(self.onHands) then
			VM:SendViewModelMatchingSequence( VM:LookupSequence( "fists_holster" ) )
			self:UpdateNextIdle()
			timer.Simple(0.5, function() VM:SendViewModelMatchingSequence( VM:LookupSequence( "nil" )  )  self:SetHoldType( "normal" ) end)
			self.Primary.Automatic = true
			self.Secondary.Automatic = false
		else
			self.ViewModel = Model( "models/weapons/c_arms.mdl" )
			self:SetHoldType( "fist" )
			VM:SendViewModelMatchingSequence( VM:LookupSequence( "fists_draw" ) )
			VM:SetWeaponModel("models/weapons/c_arms.mdl", self)
			self:UpdateNextIdle()
			self.Primary.Automatic = true
			self.Secondary.Automatic = true
		end
	end


end

function SWEP:SecondaryAttack()
	self:PrimaryAttack( true )
end

local phys_pushscale = GetConVar( "phys_pushscale" )

function SWEP:DealDamage()

	local anim = self:GetSequenceName(self.Owner:GetViewModel():GetSequence())

	self.Owner:LagCompensation( true )

	local tr = util.TraceLine( {
		start = self.Owner:GetShootPos(),
		endpos = self.Owner:GetShootPos() + self.Owner:GetAimVector() * self.HitDistance,
		filter = self.Owner,
		mask = MASK_SHOT_HULL
	} )

	if ( !IsValid( tr.Entity ) ) then
		tr = util.TraceHull( {
			start = self.Owner:GetShootPos(),
			endpos = self.Owner:GetShootPos() + self.Owner:GetAimVector() * self.HitDistance,
			filter = self.Owner,
			mins = Vector( -10, -10, -8 ),
			maxs = Vector( 10, 10, 8 ),
			mask = MASK_SHOT_HULL
		} )
	end

	if ( tr.Hit && !( game.SinglePlayer() && CLIENT ) ) then
		self:EmitSound( HitSound )
	end

	local hit = false
	local scale = phys_pushscale:GetFloat()

	if ( SERVER && IsValid( tr.Entity ) && ( tr.Entity:IsNPC() || tr.Entity:IsPlayer() || tr.Entity:Health() > 0 ) ) then
		local dmginfo = DamageInfo()

		local attacker = self.Owner
		if ( !IsValid( attacker ) ) then attacker = self end
		dmginfo:SetAttacker( attacker )




		dmginfo:SetInflictor( self )
		if(damageCharacters[self.Owner:Nick()]!= nil) then
			dmginfo:SetDamage( math.random( damageCharacters[self.Owner:Nick()][1], damageCharacters[self.Owner:Nick()][2] ) )
		else
			dmginfo:SetDamage( math.random( 8, 12 ))
		end

		if (self.Owner:GetNWFloat("HandDamage")~=0) then
			dmginfo:SetDamage( self.Owner:GetNWFloat("HandDamage"))
		end

		if ( anim == "fists_left" ) then
			dmginfo:SetDamageForce( self.Owner:GetRight() * 4912 * scale + self.Owner:GetForward() * 9998 * scale ) 
		elseif ( anim == "fists_right" ) then
			dmginfo:SetDamageForce( self.Owner:GetRight() * -4912 * scale + self.Owner:GetForward() * 9989 * scale )
		elseif ( anim == "fists_uppercut" ) then
			dmginfo:SetDamageForce( self.Owner:GetUp() * 5158 * scale + self.Owner:GetForward() * 10012 * scale )
		end

		SuppressHostEvents( NULL ) 
		tr.Entity:TakeDamageInfo( dmginfo )
		SuppressHostEvents( self.Owner )

		hit = true

	end

	if ( IsValid( tr.Entity ) ) then
		local phys = tr.Entity:GetPhysicsObject()
		if ( IsValid( phys ) ) then
			phys:ApplyForceOffset( self.Owner:GetAimVector() * 80 * phys:GetMass() * scale, tr.HitPos )
		end
	end

	if ( SERVER ) then
		if ( hit && anim != "fists_uppercut" ) then
			self:SetCombo( self:GetCombo() + 1 )
		else
			self:SetCombo( 0 )
		end
	end

	self.Owner:LagCompensation( false )

end

function SWEP:PrimaryAttack(right)
	if (self.onHands) then
		local Pos = self.Owner:GetShootPos()
		local Aim = self.Owner:GetAimVector()

		local Tr = util.TraceLine{
			start = Pos,
			endpos = Pos +Aim *self.Range,
			filter = player.GetAll(),
		}

		local HitEnt = Tr.Entity
		if self.Drag then
			HitEnt = self.Drag.Entity
		else
			if not IsValid( HitEnt ) or HitEnt:GetMoveType() ~= MOVETYPE_VPHYSICS or
				HitEnt:IsVehicle() or HitEnt:GetNWBool( "NoDrag", false ) or
				HitEnt.BlockDrag or
				IsValid( HitEnt:GetParent() ) then
				return
			end

			if not self.Drag then
				self.Drag = {
					OffPos = HitEnt:WorldToLocal(Tr.HitPos),
					Entity = HitEnt,
					Fraction = Tr.Fraction,
				}
			end
		end

		if CLIENT or not IsValid( HitEnt ) then return end

		local Phys = HitEnt:GetPhysicsObject()

		if IsValid( Phys ) then
			local Pos2 = Pos +Aim *self.Range *self.Drag.Fraction
			local OffPos = HitEnt:LocalToWorld( self.Drag.OffPos )
			local Dif = Pos2 -OffPos
			local Nom = (Dif:GetNormal() *math.min(1, Dif:Length() /100) *500 -Phys:GetVelocity()) *Phys:GetMass()

			Phys:ApplyForceOffset( Nom, OffPos )
			Phys:AddAngleVelocity( -Phys:GetAngleVelocity() /4 )
		end
	else
		self.Owner:SetAnimation( PLAYER_ATTACK1 )

		local anim = "fists_left"
		if ( right ) then anim = "fists_right" end
		if ( self:GetCombo() >= 2 ) then
			anim = "fists_uppercut"
		end

		local vm = self.Owner:GetViewModel()
		vm:SendViewModelMatchingSequence( vm:LookupSequence( anim ) )

		self:EmitSound( SwingSound )

		self:UpdateNextIdle()
		self:SetNextMeleeAttack( CurTime() + 0.2 )

		self:SetNextPrimaryFire( CurTime() + 0.9 )
		self:SetNextSecondaryFire( CurTime() + 0.9 )
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

function SWEP:Deploy()

	local speed = GetConVarNumber( "sv_defaultdeployspeed" )

	local vm = self.Owner:GetViewModel()

	vm:SetPlaybackRate( speed )

	self:SetNextPrimaryFire( CurTime() + vm:SequenceDuration() / speed )
	self:SetNextSecondaryFire( CurTime() + vm:SequenceDuration() / speed )
	self:UpdateNextIdle()

	if ( SERVER ) then
		self:SetCombo( 0 )
	end

	return true

end