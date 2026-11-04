if (SERVER)then
	AddCSLuaFile("skillcheck.lua")
	util.AddNetworkString("Check")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Skillcheck"
ENT.Spawnable = true
ENT.Editable = true

function ENT:SetupDataTables()
	self:NetworkVar( "String",	0, "NameZone",	{ KeyName = "NameZone",	Edit = { type = "String", order = 0} } )
    self:NetworkVar( "String",	1, "Model",	{ KeyName = "Model",	Edit = { type = "String", order = 1} } )
    self:NetworkVar( "String",	2, "MessageTouch",	{ KeyName = "MessageTouch",	Edit = { type = "String", order = 2} } )
    self:NetworkVar( "Bool",	3, "Freeze",	{ KeyName = "Freeze",	Edit = { type = "Bool", order = 3} } )
    self:NetworkVar( "Bool",	4, "Kill",	{ KeyName = "Kill",	Edit = { type = "Bool", order = 4} } )
    self:NetworkVar( "Bool",	5, "Hide",	{ KeyName = "Hide",	Edit = { type = "Bool", order = 5} } )
    self:NetworkVar( "String",	3, "OwnerZone",	{ KeyName = "OwnerZone",	Edit = { type = "String", order = 6} } )
    self:NetworkVar( "Int",	0, "Damage",	{ KeyName = "Damage",	Edit = { type = "Int", min = 0, max = 100, order = 7} } )
    self:NetworkVar( "Bool",	0, "Explode",	{ KeyName = "Explode",	Edit = { type = "Bool", order = 8} } )
	
	if ( SERVER ) then
		self:NetworkVarNotify( "NameZone", self.OnNameChanged )
		self:NetworkVarNotify( "Model", self.OnCharacterNameChanged )
		self:NetworkVarNotify( "Hide", self.OnHideChanged )
	end
end


if SERVER then
	function ENT:Initialize( )
	self:SetModel("models/hunter/blocks/cube075x075x025.mdl")
    self:SetSolid( SOLID_VPHYSICS )
    self:SetTrigger( true )
    self:PhysWake()
    self:SetCollisionGroup(20)
	end
end

function ENT:OnModelChanged( varname, oldvalue, newvalue )
	self:SetModel(self:GetNWString("Model"))
    self:SetSolid( SOLID_VPHYSICS )
	self:SetTrigger( true )
    self:PhysWake()
    self:SetCollisionGroup(20)
end

function ENT:OnHideChanged( name, old, new )
	if (new == true) then
		self:SetMaterial("aaa/empty")
	else
		self:SetMaterial("")
	end
end

function ENT:OnNameChanged( name, old, new )
	self:SetNWString("NameZone",new)
end

function ENT:Use(activator)
	net.Start("Check")
	net.WriteEntity(self)
	net.Send(activator)
end

function ENT:Think()

end

function ENT:Draw()
	self:DrawModel()
end

if CLIENT then
		local foodSearch = false
		local Search = 0
		local lockFood = 0
		local rnd = 0
		local movingImage = nil
		local GlobalLenght = 0
		local Globalent = nil
		local Time = 0
		local PlayerObservation = 5
		local ent = nil
		local closeButtonFoodMachine = nil
		local i = 0
		local SearchScaler = 3
	local function Waiting(GlobalTime, startlenght, GlobalLenght1)
	    local function NextPart()
	        local scaler = 1

	       print(GlobalLenght)
        	print(GlobalTime)

	        if movingImage ~= nil then
	            if movingImage:GetX() >= ScrW()/2+rnd+GlobalLenght/4 - GlobalLenght/64-PlayerObservation and movingImage:GetX() <= ScrW()/2+rnd+GlobalLenght/4 + GlobalLenght/64 then
	                scaler = 4
	                elseif movingImage:GetX() >= ScrW()/2+rnd+GlobalLenght/4 - GlobalLenght/8-PlayerObservation and movingImage:GetX() <= ScrW()/2+rnd+GlobalLenght/4 + GlobalLenght/8 then
	                scaler = 2
	                elseif movingImage:GetX() >= ScrW()/2+rnd-PlayerObservation and movingImage:GetX() <= ScrW()/2+rnd+GlobalLenght/2 then
	                scaler = 1
	            else
	                scaler = 0
	            end
	        end

	        if GlobalLenght < startlenght/GlobalTime*(scaler+1) and scaler ~= 0 then
	            scaler = scaler + 3
	        end

	            if (LocalPlayer():Name() == "Кируми Тоджо" or LocalPlayer():Name() == "Терутеру Ханамура") then
	                scaler = scaler * 3
	            end

	            GlobalLenght = GlobalLenght - (startlenght/GlobalTime)*scaler
	            
	                --Time = Time - 1
	                if (Time <= 0 and Globalent ~= nil) or (GlobalLenght <0 and Globalent ~= nil) then
	                    --net.Start("SearchFood2")
	                    --net.SendToServer()
	                    closeButtonFoodMachine:Close()
	                    movingImage = nil
	                    if(Search == 0) then
	                        foodSearch = false
	                    end
	                    Globalent = nil
	                    end
	                    Waiting(GlobalTime, startlenght,GlobalLenght)
	                end
	    if closeButtonFoodMachine == nil then
	        closeButtonFoodMachine = vgui.Create( "DFrame" )
	        closeButtonFoodMachine:SetSize( ScrW(), ScrH())
	        --closeButtonFoodMachine:SetPos(ScrW()/2-70, ScrH()/2+80)
	        closeButtonFoodMachine.Paint = function (self,w,h)
	        end
	        function closeButtonFoodMachine:OnRemove()
	            closeButtonFoodMachine = nil 
	        end
	        closeButtonFoodMachine:MakePopup()
	        closeButtonFoodMachine:SetKeyboardInputEnabled( false )
	        closeButtonFoodMachine:SetTitle("")
	        closeButtonFoodMachine:ShowCloseButton(false)
	        closeButtonFoodMachine:SetScreenLock(false)
	        closeButtonFoodMachine:SetDraggable(false)
	        local buttonCloseFoodMachine = vgui.Create("DButton",closeButtonFoodMachine)
	        buttonCloseFoodMachine:SetText("X")
	        buttonCloseFoodMachine:SetSize( 50, 50)
	        buttonCloseFoodMachine:SetPos(ScrW()- 50, 0)
	        buttonCloseFoodMachine.DoClick = function()
	                --net.Start("SearchFood2")
	                --net.SendToServer()
	                GlobalLenght = -15
	                Search = 1
	                foodSearch = false
	                NextPart()
	            end
	        local reactionButtonFoodMachine = vgui.Create("DButton",closeButtonFoodMachine)
	        reactionButtonFoodMachine:SetText("Искать")
	        reactionButtonFoodMachine:SetSize( ScrW()/12, ScrH()/18)
	        reactionButtonFoodMachine:SetPos(ScrW()/2-70, ScrH()/2+80)
	        reactionButtonFoodMachine.DoClick = function()
	            NextPart()
	            end
	        end

	        
	    if GlobalLenght >0 then
	        rnd = math.random(-200,200-GlobalLenght/2)
	        if movingImage == nil then
	        movingImage = vgui.Create("DButton",closeButtonFoodMachine)
	        movingImage:SetSize(PlayerObservation,50)
	        movingImage:SetText("")
	        movingImage:SetPos(ScrW()/2-GlobalLenght/2, ScrH()/2-14)
	        end
	        
	        hook.Add("HUDPaint", "Names3", function()
	                if (LocalPlayer():GetPos():Distance(ent:GetPos()) > 120) then
	                    foodSearch = false
	                    GlobalLenght = -15
	                    Search = 1
	                    NextPart()
	                end

	                draw.SimpleText("Идёт поиск", "Trebuchet24", ScrW()/2, ScrH()/2-25, Color( 255, 255, 255, 255), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
	                surface.SetDrawColor(Color(255,255,255,50))
	                surface.DrawRect(ScrW()/2-400/2,ScrH()/2+20,400,22)

	                surface.SetDrawColor(Color(255,255,255,255))
	                surface.DrawRect(ScrW()/2+rnd,ScrH()/2+20,GlobalLenght/2,22)

	                surface.SetDrawColor(Color(255,248,187,255))
	               -- surface.DrawRect(ScrW()/2+rnd+GlobalLenght/4,ScrH()/2,GlobalLenght/8,22)
	                surface.DrawRect(ScrW()/2+rnd+GlobalLenght/4- GlobalLenght/8,ScrH()/2+20,GlobalLenght/4,22)
	                surface.SetDrawColor(Color(255,188,82,255))
	                surface.DrawRect(ScrW()/2+rnd+GlobalLenght/4 - GlobalLenght/64,ScrH()/2+20,GlobalLenght/32,22)
	                if i >= 400 - PlayerObservation/2 then
	                    SearchScaler = -3
	                    elseif i <= - PlayerObservation/2 then
	                        SearchScaler = 3
	                end

	                --if i < 400 then
	                i = i + SearchScaler
	            --else
	            --    i = 0
	            --end
	            if movingImage ~= nil then
	                movingImage:SetPos(ScrW()/2-400/2+i, ScrH()/2-14+20)
	            end
	        end)
	    end
	    if GlobalLenght < startlenght/GlobalLenght or GlobalLenght <= 0 then
	        hook.Add("HUDPaint", "Names3", function()
	            draw.SimpleText(" ", "Trebuchet24", ScrW()/2, ScrH()/2-25, Color( 255, 255, 255, 255), TEXT_ALIGN_CENTER, TEXT_ALIGN_TOP)
	        end)
	    end
	    if foodSearch == false then
	        lockFood = 0
	    end
	end
	net.Receive("Check", function()
		ent = net.ReadEntity()
		GlobalLenght = 400
		Globalent = ent
		Time = 5
		Waiting(2,400,400)
	end)
end