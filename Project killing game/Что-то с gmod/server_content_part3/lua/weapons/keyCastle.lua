local doorInCastle
local doorOnCastle
if SERVER then
	AddCSLuaFile()
end

SWEP.PrintName			= "Замок"
SWEP.Author				= "DDF"
SWEP.Instructions				= "ЛКМ - открыть дверь\nПКМ - закрыть дверь"
SWEP.Spawnable				= true
SWEP.Category				= "DDF V3 Keys"

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

function SWEP:Initialize()
	self.onHands = true
	self.Time = 0
	self.Range = 150
	self:SetHoldType( "pistol" )
	for k,v in ipairs(ents.GetAll()) do
		if (v:GetModel() == "*493") then
			doorInCastle = v
		end
		if (v:GetModel() == "*496") then
			doorOnCastle = v
		end
	end
end

function SWEP:Deploy()
	end

function SWEP:SecondaryAttack()
local eyetrace = self.Owner:GetEyeTrace()
	if (eyetrace.Entity:GetClass() == "func_button" and self.Owner:GetPos():Distance(eyetrace.Entity:GetPos()) < 150 and !eyetrace.Entity:GetSaveTable().m_bLocked and (eyetrace.Entity:GetModel() == "*493" or eyetrace.Entity:GetModel() == "*496")) then
		self.Owner:EmitSound("doors/door_close.mp3")
		doorInCastle:Fire("Lock")
		doorOnCastle:Fire("Lock")
	end
end

function SWEP:PrimaryAttack(right)
local eyetrace = self.Owner:GetEyeTrace()
	if (eyetrace.Entity:GetClass() == "func_button" and self.Owner:GetPos():Distance(eyetrace.Entity:GetPos()) < 150 and eyetrace.Entity:GetSaveTable().m_bLocked and (eyetrace.Entity:GetModel() == "*493" or eyetrace.Entity:GetModel() == "*496")) then
		self.Owner:EmitSound("doors/door_open.mp3")
		doorInCastle:Fire("Unlock")
		doorOnCastle:Fire("Unlock")
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
