if (SERVER)then
	AddCSLuaFile("Landlinephone.lua")
	util.AddNetworkString("StartPhone")
	util.AddNetworkString("EndPhone")
	util.AddNetworkString("CallPhone")
	util.AddNetworkString("StartCalling")
	util.AddNetworkString("PutPhone")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Landline phone"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()
	self:NetworkVar( "String",	0, "NumberPhone",	{ KeyName = "NumberPhone",	Edit = { type = "String", order = 0} } )
	self:NetworkVar( "Bool",	3, "Calling",	{ KeyName = "Calling",	Edit = { type = "Bool", order = 3} } )
	self:NetworkVar( "Bool",	1, "Busy",	{ KeyName = "Busy",	Edit = { type = "Bool", order = 2} } )

	if SERVER then
		self:NetworkVarNotify( "NumberPhone", self.OnNameChanged )
	end
end

function ENT:OnNameChanged( name, old, new )
	self:SetNWString("NumberPhone",new)
end

function ENT:Initialize( )
	self:SetModel("models/hunter/blocks/cube05x05x05.mdl")
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
end


function ENT:Use(activator)
	if(activator:IsPlayer() and self:GetBusy() == false and self:GetCalling() == false) then
		self:SetBusy(true)
		net.Start("StartPhone")
		net.WriteEntity(self)
		net.Send(activator)
	elseif(activator:IsPlayer() and self:GetBusy() == false and self:GetCalling() == true) then
		self:SetBusy(true)
		self:GetCalling(false)
		self:StopSound("phonesound.mp3")
		activator:SetNWString("PhoneCall",self:GetNumberPhone())
		net.Start("StartCalling")
		net.WriteEntity(self)
		net.Send(activator)
	end
end

function ENT:Draw()
	self:DrawModel()
end

if SERVER then
	net.Receive("EndPhone", function()
		local phone = net.ReadEntity()
		phone:SetBusy(false)
	end)
	net.Receive("CallPhone", function(len,ply)
		local number = net.ReadString()
		local phone = net.ReadEntity()
		local CallPhone
		for k, v in ipairs( ents.FindByClass( "landlinephone" ) ) do
			if v:GetNumberPhone() == number and v:GetNumberPhone() ~= phone:GetNumberPhone() then
				CallPhone = v
				ply:SetNWString("PhoneCall",number)
				ply:SetNWEntity("Phone", CallPhone)
			end
		end
		if (CallPhone~= nill) then
			if(CallPhone:GetCalling()==false and CallPhone:GetBusy()==false) then
				CallPhone:EmitSound( "phonesound.mp3" )
				CallPhone:SetCalling(true)
				timer.Simple(30.0, function ()
					if CallPhone:GetBusy() == false then
						CallPhone:StopSound("phonesound.mp3")
						CallPhone:SetCalling(false)
					end
				end)
			elseif (CallPhone:GetCalling()==true or CallPhone:GetBusy()==true) then
				ply:EmitSound( "busyphone.mp3" )
			end
		else
			ply:EmitSound( "falsecalling.mp3" )
			print(ply:Name())
		end
	end)
	net.Receive("PutPhone", function(len,ply)
		ply:StopSound("putphone.mp3" )
		ply:StopSound( "falsecalling.mp3" )
		local phone = net.ReadEntity()
		if (ply:GetNWEntity("Phone") ~= nill) then
			if(ply:GetNWEntity("Phone"):IsValid()) then
				ply:GetNWEntity("Phone"):StopSound("phonesound.mp3")
				ply:GetNWEntity("Phone"):SetCalling(false)
				ply:SetNWEntity("Phone", nill)
			end
		end
		local numbphone = ply:GetNWString("PhoneCall")
		ply:SetNWString("PhoneCall", "")
		for k, v in ipairs( player.GetAll() ) do
			if v:GetNWString("PhoneCall") == numbphone then
				v:EmitSound( "putphone.mp3" )
				v:SetNWString("PhoneCall","")
				if (v:GetNWEntity("Phone") ~= nill) then
					ply:SetNWEntity("Phone", nill)
				end
			end
		end
	end)
end

if CLIENT then
	net.Receive("StartPhone", function ()
		local phone = net.ReadEntity()
		local PhoneFrame = vgui.Create("DFrame")
		PhoneFrame:SetSize( ScrW()/8, ScrH()/10)
		PhoneFrame:Center()
		PhoneFrame:SetTitle("")
		PhoneFrame:MakePopup()
		PhoneFrame:SetKeyboardInputEnabled( true )
		PhoneFrame.OnRemove = function()
			net.Start("EndPhone")
			net.WriteEntity(phone)
			net.SendToServer()
        end

        local NumberPhone = PhoneFrame:Add("DTextEntry")
        NumberPhone:SetSize(PhoneFrame:GetWide()/1.5, PhoneFrame:GetTall()/4)
        NumberPhone:Center()

        local CallButton = PhoneFrame:Add("DButton")
        CallButton:SetSize(NumberPhone:GetWide()/1.5, NumberPhone:GetTall()/1.5)
        CallButton:Center()
        CallButton:SetPos(CallButton:GetX(),PhoneFrame:GetTall()-CallButton:GetTall()*2)
        CallButton:SetText("Позвонить")
        CallButton.DoClick = function()
        	if CallButton:GetText() == "Позвонить" then
        		PhoneFrame:SetKeyboardInputEnabled( false )
	        	net.Start("CallPhone")
	        	net.WriteString(NumberPhone:GetText())
	        	net.WriteEntity(phone)
	        	net.SendToServer()
	        	CallButton:SetText("Положить")
	        else
	        	PhoneFrame:SetKeyboardInputEnabled( true )
	        	CallButton:SetText("Позвонить")
	        	net.Start("PutPhone")
	        	net.WriteEntity(phone)
	        	net.SendToServer()
	        end
        end
	end)

	net.Receive("StartCalling", function ()
		local phone = net.ReadEntity()
		local PhoneFrame = vgui.Create("DFrame")
		PhoneFrame:SetSize( ScrW()/8, ScrH()/10)
		PhoneFrame:Center()
		PhoneFrame:SetTitle("")
		PhoneFrame:MakePopup()
		PhoneFrame:SetKeyboardInputEnabled( false )
		PhoneFrame.OnRemove = function()
			net.Start("EndPhone")
			net.WriteEntity(phone)
			net.SendToServer()
        end

        local NumberPhone = PhoneFrame:Add("DTextEntry")
        NumberPhone:SetSize(PhoneFrame:GetWide()/1.5, PhoneFrame:GetTall()/4)
        NumberPhone:Center()

        local CallButton = PhoneFrame:Add("DButton")
        CallButton:SetSize(NumberPhone:GetWide()/1.5, NumberPhone:GetTall()/1.5)
        CallButton:Center()
        CallButton:SetPos(CallButton:GetX(),PhoneFrame:GetTall()-CallButton:GetTall()*2)
        CallButton:SetText("Положить")
        CallButton.DoClick = function()
        	if CallButton:GetText() == "Позвонить" then
        		PhoneFrame:SetKeyboardInputEnabled( false )
	        	net.Start("CallPhone")
	        	net.WriteString(NumberPhone:GetText())
	        	net.WriteEntity(phone)
	        	net.SendToServer()
	        	CallButton:SetText("Положить")
	        else
	        	PhoneFrame:SetKeyboardInputEnabled( true )
	        	CallButton:SetText("Позвонить")
	        	net.Start("PutPhone")
	        	net.WriteEntity(phone)
	        	net.SendToServer()
	        end
        end
	end)
end