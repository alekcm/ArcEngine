if SERVER then
	AddCSLuaFile()
	util.AddNetworkString('OpenMonopad')
	util.AddNetworkString('CloseMonopad')
	util.AddNetworkString('OpenMonopad2')
	util.AddNetworkString('CloseMonopad2')
	util.AddNetworkString('OpenMonopad3')
	util.AddNetworkString('CloseMonopad3')
	util.AddNetworkString("AddMonopad")
	util.AddNetworkString("DelMonopad")
	util.AddNetworkString("DropMonopad")
	util.AddNetworkString("ChoiceMonopad")
	util.AddNetworkString("ChoiceMonopad2")
	util.AddNetworkString("ChoiceMonopad3")
end

SWEP.PrintName			= "Монопад"
SWEP.Author				= "DDF"
SWEP.Instructions				= "ЛКМ - открыть монопад"
SWEP.Spawnable				= true
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

SWEP.BounceWeaponIcon  = false

--local chars = {["Makoto"] = "Макото Наеги",["Aoi"] = "Аой Асахина",["Byakuya"] = "Бьякуя Тогами",["Celestia"] = "Селестия Люденберг",["Chihiro"] = "Чихиро Фуджисаки",["Hifumi"] = "Хифуми Ямада",["Junko"] = "Джунко Эношима",["Kiyotaka"] = "Киётака Ишимару",["Kyoko"] = "Кёко Киригири",["Mondo"] = "Мондо Овада",["Leon"] = "Леон Кувата",["Mukuro"] = "Мукуро Икусаба",["Sakura"] = "Сакура Огами",["Sayaka"] = "Саяка Майзоно",["Toko"] = "Токо Фукава",["Yasuhiro"] = "Ясухиро Хагакуре",["Hajime"] = "Хаджиме Хината",["Akane"] = "Акане Овари",["Imposter"] = "Бьякуя Тогами",["Chiaki"] = "Чиаки Нанами",["Fuyuhiko"] = "Фуюхико Кузурю",["Gundham"] = "Гандам Танака",["Hiyoko"] = "Хиёко Сайонджи",["Ibuki"] = "Ибуки Миода",["Kazuichi"] = "Казуичи Сода",["Mahiru"] = "Махиру Коидзуми",["Mikan"] = "Микан Тсумики",["Nagito"] = "Нагито Комаеда",["Nekomaru"] = "Некомару Нидай",["Peko"] = "Пеко Пекояма",["Sonia"] = "Сония Невермайнд",["Teruteru"] = "Терутеру Ханамура",["Rantaro"] = "Рантаро Амами",["Kaede"] = "Каедэ Акаматсу",["Angie"] = "Анджи Йонага",["Gonta"] = "Гонта Гокухара",["Himiko"] = "Химико Юмено",["k1-b0"] = "K1-B0",["Kaito"] = "Кайто Момота",["Kirumi"] = "Кируми Тоджо",["Kokichi"] = "Кокичи Ома",["Korekiyo"] = "Корекиё Шингуджи",["Maki"] = "Маки Харукава",["Miu"] = "Миу Ирума",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами",["Rantaro"] = "Рантаро Амами"}


function SWEP:DrawWeaponSelection( x, y, wide, tall, alpha )
	
	-- Set us up the texture
	surface.SetDrawColor( 255, 255, 255, alpha )
	surface.SetMaterial( Material("weaponicon/monopad3.png" ))
	
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

function SWEP:Deploy()
	--print(self.Weapon:GetPrintName())
--[[	self.Weapon.WorldModel = "models/ddf/monopad_world2.mdl" 
	self:SetHoldType( "normal" )--]]
	end

	function SWEP:OwnerChanged()
	if(SERVER) then
		if(self:GetNWString("OwnerMonopad") == "") then
			self:SetNWString("OwnerMonopad", self.Owner:Name())
			net.Start("AddMonopad")
			net.WriteString(self:GetNWString("OwnerMonopad"))
			net.Send(self.Owner)
			net.Start("ChoiceMonopad3")
			net.WriteString(self:GetNWString("OwnerMonopad"))
			net.Send(self.Owner)
		else
			net.Start("AddMonopad")
			net.WriteString(self:GetNWString("OwnerMonopad"))
			net.Send(self.Owner)
			net.Start("ChoiceMonopad3")
			net.WriteString(self:GetNWString("OwnerMonopad"))
			net.Send(self.Owner)
		end
	end
end

	if SERVER then

		net.Receive("CloseMonopad2", function()
			local ply = net.ReadEntity()
			if ply:GetActiveWeapon():GetClass() == "monopad" then
				ply:GetActiveWeapon():SetHoldType( "normal" )
			end
			net.Start("CloseMonopad3")
			net.WriteEntity(ply)
			net.Broadcast()
	end)
				net.Receive("OpenMonopad2", function()
			local ply = net.ReadEntity()
			net.Start("OpenMonopad3")
			net.WriteEntity(ply)
			net.Broadcast()
	end)

	end
	if CLIENT then
		net.Receive("CloseMonopad3", function()
			local ply = net.ReadEntity()
			ply:GetActiveWeapon().WorldModel = "models/ddf/monopad_world.mdl"
	end)
				net.Receive("OpenMonopad3", function()
			local ply = net.ReadEntity()
			ply:GetActiveWeapon().WorldModel = "models/ddf/monopad_world.mdl"
	end)
	end



function SWEP:Reload()
	timer.Simple(0.125, function()
	self.Weapon.WorldModel = "models/ddf/monopad_world.mdl" 
end)
	self:SetHoldType( "normal" )
	if SERVER then
		net.Start("DelMonopad")
		net.Send(self:GetOwner())
	end
--self.Weapon:GetNWBool("RemoveMonopad")
--[[if self.Weapon:GetNWBool("RemoveMonopad") then
	self.Weapon.WorldModel = "models/ddf/monopad_world2.mdl" 
	self:SetHoldType( "normal" )
	--self.Owner:SetNWBool("RemoveMonopad", false)
end--]]
end

hook.Add( "KeyPress", "MonopadSelect", function( ply, key )
	if SERVER then
		if ( ply:GetEyeTrace().Entity:GetClass() == "monopad" and ply:HasWeapon("monopad") and key == IN_USE) then
			net.Start("AddMonopad")
			net.WriteString(ply:GetEyeTrace().Entity:GetNWString("OwnerMonopad"))
			net.Send(ply)
			ply:GetEyeTrace().Entity:Remove()
		end
	end
end)

net.Receive("CloseMonopad", function ( len,ply)
	--ply:GetActiveWeapon():SetNWBool("RemoveMonopad", true)
	--ply:DoAttackEvent()
	ply:GetViewModel():SetWeaponModel("models/ddf/monopad.mdl", ply:GetActiveWeapon())
	--local me = net.WriteEntity()
	--SetPassiveModel()
	--ply:GetActiveWeapon().WorldModel = "models/ddf/monopad_world2.mdl" 
	--ply:GetActiveWeapon():SetHoldType( "normal" )
	ply:SelectWeapon("re_hands")
	ply:SelectWeapon("monopad")
	--self.Weapon.WorldModel = "models/ddf/monopad_world2.mdl" 
	--self:SetHoldType( "normal" )
end)

function SWEP:PrimaryAttack(right)
	--self.Weapon:SetNWBool("RemoveMonopad", false)
	timer.Simple(0.125, function()
	self.Weapon.WorldModel = "models/ddf/monopad_world.mdl" 
end)
	self:SetHoldType( "camera" )
	if CLIENT then
		OpenMonopad()
					net.Start("OpenMonopad2")
					net.WriteEntity( self.Owner )
					net.SendToServer()
		--self.Owner:GetViewModel():SetWeaponModel("models/weapons/c_arms.mdl", self)
end

if SERVER then
	self.Owner:GetViewModel():SetWeaponModel("models/weapons/c_arms.mdl", self)
end

end

if CLIENT then
	local x, y = ScrW() /2, ScrH() /2
	local MainCol = Color( 255, 255, 255, 255 )
	local Col = Color( 255, 255, 255, 255 )
	local myMonopads = {}

	net.Receive("AddMonopad", function()
		table.insert(myMonopads,net.ReadString())
	end)

	local mpFrame = nil
	net.Receive("ChoiceMonopad", function()
		if mpFrame == nil or mpFrame == NULL then
			mpFrame = vgui.Create("DFrame")
			mpFrame:SetSize(ScrW()/4,ScrH()/2)
			mpFrame:Center()
			mpFrame:MakePopup()
			mpFrame:SetTitle("Монопады")
			function mpFrame:OnRemove()
                mpFrame = nil 
            end
            local MonopadsScroll = vgui.Create( "DScrollPanel", mpFrame )
            MonopadsScroll:Dock(FILL)

            for i,v in ipairs(myMonopads) do
            	local buttonMonopad = MonopadsScroll:Add("DButton")
            	buttonMonopad:SetText(v)
            	buttonMonopad:Dock(TOP)
            	buttonMonopad.DoClick = function()
            		net.Start("ChoiceMonopad2")
            		net.WriteString(v)
            		net.SendToServer()
            	end
            end
		end
	end)

	local monopadsFrame = nil
	net.Receive("DelMonopad", function()
		if monopadsFrame == nil or monopadsFrame == NULL then
			monopadsFrame = vgui.Create("DFrame")
			monopadsFrame:SetSize(ScrW()/4,ScrH()/2)
			monopadsFrame:Center()
			monopadsFrame:MakePopup()
			monopadsFrame:SetTitle("Монопады")
			function monopadsFrame:OnRemove()
                monopadsFrame = nil 
            end
            local MonopadsScroll = vgui.Create( "DScrollPanel", monopadsFrame )
            MonopadsScroll:Dock(FILL)

            for i,v in ipairs(myMonopads) do
            	local buttonMonopad = MonopadsScroll:Add("DButton")
            	buttonMonopad:SetText(v)
            	buttonMonopad:Dock(TOP)
            	buttonMonopad.DoClick = function()
            		net.Start("DropMonopad")
            		if (i<#myMonopads and i > 1) then
            			net.WriteString(v)
            		elseif (#myMonopads>1 and i!= 1) then
            			net.WriteString(v)
            		else
            			net.WriteString(v)
            		end
            		net.WriteInt(#myMonopads,5)
            		net.SendToServer()
            		table.remove(myMonopads,i)
            		monopadsFrame:Remove()
            	end
            end
		end
	end)

	hook.Add( "PlayerButtonDown", "MonopadCh", function( ply, button )

	end)

	function SWEP:SecondaryAttack()
		if CLIENT then
			if trueButtonMonopad and LocalPlayer():GetActiveWeapon():GetClass() == "monopad" then
				if mpFrame == nil or mpFrame == NULL then
					mpFrame = vgui.Create("DFrame")
					mpFrame:SetSize(ScrW()/4,ScrH()/2)
					mpFrame:Center()
					mpFrame:MakePopup()
					mpFrame:SetTitle("Монопады")
					function mpFrame:OnRemove()
		                mpFrame = nil 
		            end
		            local MonopadsScroll = vgui.Create( "DScrollPanel", mpFrame )
		            MonopadsScroll:Dock(FILL)

		            for i,v in ipairs(myMonopads) do
		            	print(v)
		            	local buttonMonopad = MonopadsScroll:Add("DButton")
		            	buttonMonopad:SetText(v)
		            	buttonMonopad:Dock(TOP)
		            	buttonMonopad.DoClick = function()
		            		net.Start("ChoiceMonopad2")
		            		net.WriteString(v)
		            		net.SendToServer()
		            	end
		            end
				end
		end
	end
end

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

if SERVER then
	net.Receive("DropMonopad", function(len,ply)
		local monopadName = net.ReadString()
		local countMonopads = net.ReadInt(5)
		if (countMonopads == 1) then
			local qq = ply:GetWeapon("monopad")
			ply:DropWeapon(ply:GetWeapon("monopad"))
			qq:SetNWString("OwnerMonopad", monopadName)
		else
			local wepp = ents.Create("monopad")
			wepp:SetPos(ply:EyePos())
			wepp:Spawn()
			wepp:SetNWString("OwnerMonopad", monopadName)
		end
	end)

	net.Receive("ChoiceMonopad2", function(len,ply)
		local monopadName = net.ReadString()
		net.Start("ChoiceMonopad3")
		net.WriteString(monopadName)
		net.Send(ply)
	end)
end

print("Монопад поменяли")