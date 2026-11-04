print('monofile has been loaded')
local _UI
local _WoundsFrame
local _CurrentWound
local _DText
local IsPressedLeft = false
local IsPressedRight = false
local IsPressedUp = false
local IsPressedDown = false
local IsPressedExX = false
local IsPressedDoX = false
local IsPressedExY = false
local IsPressedDoY = false
local IsPressedRotL = false
local IsPressedRotR = false
local WoundTable = {{},{},{},{},{}}
local WoundCount = 0
local WoundStore = {}
net.Receive ("SendMonofile", function()
	if _UI ~= nil then
		_UI:Remove()
	end
	local monofile = net.ReadEntity()
	local text = net.ReadString()
	local data = net.ReadVector()
	local name = monofile:GetNWString("VictimName")
	WoundCount = monofile:GetNWFloat("WoundCount")
        
    local bool = true
		for v,info in pairs(Evidences) do
			if info == ("Файл монокумы".."\n".."\n"..text) then 
				bool = false
				break
			end
		end
	if bool == true then
    	if text ~= "" then
        	table.ForceInsert(Evidences, "Файл монокумы".."\n".."\n"..text)
		end
	end
        
        
	for i=1,WoundCount do
		WoundTable[1][i] = monofile:GetNWFloat("WoundPosX"..i)
		WoundTable[2][i] = monofile:GetNWFloat("WoundPosY"..i)
		WoundTable[3][i] = monofile:GetNWFloat("WoundRot"..i)
		WoundTable[4][i] = monofile:GetNWFloat("WoundSizeX"..i)
		WoundTable[5][i] = monofile:GetNWFloat("WoundSizeY"..i)
	end

--[[	local hz1 = tostring(data.x)
	local hz2 = tostring(data.y)
	local hz3 = tostring(data.z)
	print(hz1.." "..hz2.." "..hz3)
	for i=1,WoundCount do
		WoundTable[1][i] = hz1[i*3-2]..hz1[i*3-1]..hz1[i*3]
		WoundTable[2][i] = hz2[i*3-2]..hz2[i*3-1]..hz2[i*3]
		WoundTable[3][i] = hz3[i*3-2]..hz3[i*3-1]..hz3[i*3]
	end
	WoundTable = tonumber(WoundTable)
	if WoundTable == nil then
		WoundTable = {{},{},{}}
	end]]
--	local table = net.ReadTable()
	local panel = vgui.Create("DFrame")
	panel:SetSize(504, 700.5)
    panel:Center()
    panel:MakePopup()
    _UI = panel
    panel.Paint = function (self,w,h)
	end
	local backUI = vgui.Create("DImage", panel)
	backUI:SetImage("materials/sprites/UI/monofile/monofile1.png")
    backUI:SetSize(504, 700.5)
        local CloseButton = vgui.Create("DButton", panel)
        CloseButton:SetSize(50,25)
        CloseButton:SetPos(444,15)
        CloseButton:SetText("")
        CloseButton.DoClick = function()
            if _WoundsFrame ~= nil then
		_WoundsFrame:Remove()
	end
	        if LocalPlayer():IsSuperAdmin() then
	        net.Start("SendMonofile2")
	        net.WriteEntity(monofile)
	        net.WriteString(text)
	        net.WriteFloat(WoundCount)
	        net.WriteTable(WoundTable)
	        net.SendToServer()
	    end
                    _UI:Remove()
        end
            CloseButton.Paint = function (self,w,h)
	end
    local frontUI = vgui.Create("DImage", panel)
	frontUI:SetImage("materials/sprites/UI/monofile/chars1/"..name..".png")
	if frontUI:GetMaterial():IsError() then
		frontUI:SetImage("materials/sprites/UI/monofile/chars1/empty.png")
	end
    frontUI:SetSize(504, 700.5)
    local deadtext
	local Button1 = vgui.Create("DButton", panel)
	Button1:SetSize(140,50)
	Button1:SetPos(175,75)
	Button1:SetText("")
	local Button2 = vgui.Create("DButton", panel)
	Button2:SetSize(175,50)
	Button2:SetPos(315,75)
	Button2:SetText("")
	Button1.DoClick = function()	
backUI:SetImage("materials/sprites/UI/monofile/monofile1.png")
frontUI:SetImage("materials/sprites/UI/monofile/chars1/"..name..".png")
	if _WoundsFrame ~= nil then
		_WoundsFrame:Remove()
			end
				if _CurrentWound ~= nil then
		_CurrentWound:Remove()
			end
			if _DText ~= nil then
		_DText:Remove()
			end

	for i=1,WoundCount do
		if WoundStore[i]~=nil then
		WoundStore[i]:Remove()
		end
	end
	table.Empty(WoundStore)
	end
	Button2.DoClick = function()	
		for i=1,WoundCount do
			if WoundStore[i]~=nil then
				WoundStore[i]:Remove()
			end
		end
	table.Empty(WoundStore)
	backUI:SetImage("materials/sprites/UI/monofile/monofile2.png")
	frontUI:SetImage("materials/sprites/UI/monofile/chars2/"..name..".png")

    for i=1,WoundCount do
    	local Wound = vgui.Create("DSprite",panel)
 		Wound:SetPos(WoundTable[1][i],WoundTable[2][i])
		Wound:SetRotation(WoundTable[3][i])
		Wound:SetSize(WoundTable[4][i],WoundTable[5][i])
		Wound:SetMaterial(Material("sprites/ui/monofile/wound.png"))
		--table.Add(WoundStore)
		WoundStore[i] = Wound
    end
    	if _WoundsFrame ~= nil then
			_WoundsFrame:Remove()
			_CurrentWound:Remove()
			_DText:Remove()
		end
    if !LocalPlayer():IsSuperAdmin() then
    	--deadtext = vgui.Create("RichText",panel)
    	deadtext = vgui.Create("DLabel",panel)
    	deadtext:SetText(text)
		deadtext:SetPos(60,200)
		deadtext:SetSize(200,300)
		deadtext:SizeToContents()
		_DText = deadtext
	else

	deadtext = vgui.Create("DTextEntry",panel)
	_DText = deadtext
	deadtext:SetText(text)
	deadtext:SetPos(60,200)
	deadtext:SetSize(200,300)
	deadtext:SetMultiline( true )
	deadtext.OnTextChanged = function()
	text = deadtext:GetText()
end
		local WFrame = vgui.Create("DFrame")
		_WoundsFrame = WFrame
		WFrame:SetPos(ScrW()/2-200, -ScrH()/2)
		WFrame:SetSize(400, 400)
		local NewButton = vgui.Create("DButton", WFrame)
		NewButton:SetSize(100,100)
		NewButton:SetPos(10,30)
		NewButton:SetText("+")
		local NewWound = vgui.Create("DSprite", panel)
		_CurrentWound = NewWound
		NewWound:Center()
		NewWound:SetSize(100, 100)
		NewWound:SetMaterial(Material("sprites/ui/monofile/chosedwound.png"))
		NewButton.DoClick = function()
		local NewWound = vgui.Create("DSprite", panel)
		NewWound:SetPos(_CurrentWound:GetPos())
		NewWound:SetRotation(_CurrentWound:GetRotation())
		NewWound:SetSize(_CurrentWound:GetSize())
		WoundCount = WoundCount + 1
		WoundTable[1][WoundCount],WoundTable[2][WoundCount] = _CurrentWound:GetPos()
		WoundTable[3][WoundCount] = _CurrentWound:GetRotation()
		WoundTable[4][WoundCount],WoundTable[5][WoundCount] = _CurrentWound:GetSize()
		NewWound:SetMaterial(Material("sprites/ui/monofile/wound.png"))
		_CurrentWound:MoveToFront()
	end
		local LeftButton = vgui.Create ("DButton", WFrame)
		LeftButton:SetSize(50,50)
		LeftButton:SetPos(110,80)
		LeftButton:SetText("←")
		LeftButton.OnDepressed = function()
			IsPressedLeft = true
		end
		LeftButton.OnReleased = function()
			IsPressedLeft = false
		end
local RightButton = vgui.Create ("DButton", WFrame)
		RightButton:SetSize(50,50)
		RightButton:SetPos(210,80)
		RightButton:SetText("→")
		RightButton.OnDepressed = function()
			IsPressedRight = true
		end
		RightButton.OnReleased = function()
			IsPressedRight = false
		end
local UpButton = vgui.Create ("DButton", WFrame)
		UpButton:SetSize(50,50)
		UpButton:SetPos(160,30)
		UpButton:SetText("↑")
		UpButton.OnDepressed = function()
			IsPressedUp = true
		end
		UpButton.OnReleased = function()
			IsPressedUp = false
		end
local DownButton = vgui.Create ("DButton", WFrame)
		DownButton:SetSize(50,50)
		DownButton:SetPos(160,80)
		DownButton:SetText("↓")
		DownButton.OnDepressed = function()
			IsPressedDown = true
		end
		DownButton.OnReleased = function()
			IsPressedDown = false
		end
local ExXButton = vgui.Create ("DButton", WFrame)
		ExXButton:SetSize(120,50)
		ExXButton:SetPos(110,180)
		ExXButton:SetText("←                         →")
		--ExXButton:SetText("↔")
		ExXButton.OnDepressed = function()
			IsPressedExX = true
		end
		ExXButton.OnReleased = function()
			IsPressedExX = false
		end
local DoXButton = vgui.Create ("DButton", WFrame)
		DoXButton:SetSize(50,50)
		DoXButton:SetPos(145,180)
		DoXButton:SetText("→  ←")
		DoXButton.OnDepressed = function()
			IsPressedDoX = true
		end
		DoXButton.OnReleased = function()
			IsPressedDoX = false
		end
local ExYButton = vgui.Create ("DButton", WFrame)
		ExYButton:SetSize(50,110)
		ExYButton:SetPos(260,165)
		ExYButton:SetText(" ↑".."\n".."\n".."\n".."\n".."\n".."\n".." ↓")
		ExYButton.OnDepressed = function()
			IsPressedExY = true
		end
		ExYButton.OnReleased = function()
			IsPressedExY = false
		end
local DoYButton = vgui.Create ("DButton", WFrame)
		DoYButton:SetSize(50,50)
		DoYButton:SetPos(260,195)
		DoYButton:SetText(" ↓".."\n".."\n".." ↑")
		DoYButton.OnDepressed = function()
			IsPressedDoY = true
		end
		DoYButton.OnReleased = function()
			IsPressedDoY = false
		end
local RotLButton = vgui.Create ("DButton", WFrame)
		RotLButton:SetSize(50,50)
		RotLButton:SetPos(110,30)
		RotLButton:SetText("←┐")
		RotLButton.OnDepressed = function()
			IsPressedRotL = true
		end
		RotLButton.OnReleased = function()
			IsPressedRotL = false
		end
local RotRButton = vgui.Create ("DButton", WFrame)
		RotRButton:SetSize(50,50)
		RotRButton:SetPos(210,30)
		RotRButton:SetText("┌→")
		RotRButton.OnDepressed = function()
			IsPressedRotR = true
		end
		RotRButton.OnReleased = function()
			IsPressedRotR = false
		end
		end
	end
	Button1.Paint = function (self,w,h)
	end
	Button2.Paint = function (self,w,h)
	end

	        panel.OnClose = function ()
	        if _WoundsFrame ~= nil then
		_WoundsFrame:Remove()
	end
	        if LocalPlayer():IsSuperAdmin() then
	        net.Start("SendMonofile2")
	        net.WriteEntity(monofile)
	        net.WriteString(text)
	        net.WriteFloat(WoundCount)

----------------------------------------
	--WoundTable = tostring(WoundTable)
--[[	local hz1 = ""
	local hz2 = ""
	local hz3 = ""
	for i=1,WoundCount do
		local pox, poy = WoundTable[1][i]
		local szx, szy = WoundTable[3][i]
		hz1 = hz1..tostring(pox)..tostring(poy)
		hz2 = hz2..tostring(WoundTable[2][i])
		hz3 = hz3..tostring(szx)..tostring(szy)
	end
	print(hz1.." "..hz2.." "..hz3)
	local WT = Vector(tonumber(hz1),tonumber(hz2),tonumber(hz3))
]]


	        net.WriteTable(WoundTable)
	        net.SendToServer()
	    end
end
    end)

hook.Add("Think", "Wounds", function (ply, button)
	if _CurrentWound ~= nil then
		if IsPressedLeft then
					_CurrentWound:SetX(_CurrentWound:GetX()- 1)
				end
			if IsPressedRight then
					_CurrentWound:SetX(_CurrentWound:GetX()+ 1)
				end
			if IsPressedUp then
					_CurrentWound:SetY(_CurrentWound:GetY()- 1)
				end
			if IsPressedDown then
					_CurrentWound:SetY(_CurrentWound:GetY()+ 1)
				end
			if IsPressedExX then
				local sz, hz = _CurrentWound:GetSize()
				_CurrentWound:SetSize(sz+1,hz)
			end
			if IsPressedDoX then
				local sz, hz = _CurrentWound:GetSize()
				_CurrentWound:SetSize(sz-1,hz)
			end
			if IsPressedExY then
				local sz, hz = _CurrentWound:GetSize()
				_CurrentWound:SetSize(sz,hz+1)
			end
			if IsPressedDoY then
				local sz, hz = _CurrentWound:GetSize()
				_CurrentWound:SetSize(sz,hz-1)
			end
			if IsPressedRotL then
				_CurrentWound:SetRotation(_CurrentWound:GetRotation()+1)
			end
			if IsPressedRotR then
				_CurrentWound:SetRotation(_CurrentWound:GetRotation()-1)
			end
			end
		end)



