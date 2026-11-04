TOOL.Category = "DDF"
TOOL.Name = "Evidence"
TOOL.Command = nil
TOOL.ConfigName = "" 
 
TOOL.ClientConVar[ "myparameter" ] = "fubar"

local EvidenceToolFrame = nil
local EvidenceText = nil
local EvidenceVision = 5
local ImageSmall = " "
local ImageBig = " "
local EvidenceModel = " "
local IconEvidence = " "

if SERVER then
util.AddNetworkString("GetEvidenceText")
util.AddNetworkString("GetNewEvidences")
util.AddNetworkString("SetNewEvidences")
util.AddNetworkString("GetGlobalEvidences")
util.AddNetworkString("GetGlobalEvidences2")
util.AddNetworkString("GetPersonalEvidence")
util.AddNetworkString("PersonalEvidence")
end
function TOOL:LeftClick( trace )
if(SERVER) then
		local button = ents.Create( "evidence" )
		button:SetPos( trace.HitPos )
		--button:SetEvidence(EvidenceText)

		button:SetHTMLPath(ImageSmall)
		button:SetBigHTMLPath(ImageBig)
		button:SetIconPath(IconEvidence)
		button:Spawn()
		button:SetMoveType(MOVETYPE_NONE)
		EvidencesText[button] = EvidenceText
		button:SetVision(EvidenceVision)
		if (EvidenceModel != "" and EvidenceModel != " ") then
			button:SetModel(EvidenceModel)
			button:SetMaterial("")
			button:SetMoveType(MOVETYPE_VPHYSICS)
			button:PhysicsInit(SOLID_VPHYSICS)
			button:SetSolid( SOLID_VPHYSICS)
			button:SetCollisionGroup(0)
		end
	end
end
 
 if(SERVER) then
	net.Receive("GetEvidenceText",function()
		EvidenceText = net.ReadString()
		EvidenceVision = net.ReadInt(6)
		local table1 = net.ReadTable()
		ImageSmall = table1[1]
		ImageBig = table1[2]
		EvidenceModel = table1[3]
		IconEvidence = table1[4]
	end)
	net.Receive("GetPersonalEvidence",function()
		net.Start("PersonalEvidence")
		net.WriteTable(net.ReadTable())
		net.Send(net.ReadEntity())
	end)
 end
 
if (CLIENT) then
TOOL.Information = {

		{ name = "info", stage = 1 },
		{ name = "left" },
		{ name = "right" },

	}
language.Add("Tool.evidencetool.name","EvidenceTool")
language.Add("Tool.evidencetool.desc","Создание улик")
language.Add("Tool.evidencetool.left","Создать улику в указанной точке.")
language.Add("Tool.evidencetool.right","Открыть меню создания улик.")
local NewEvidences = {}
local EvText1 = ""
local EvText2 = ""
local EvVis = 5
local EvHTML = ""
local EvBHTML = ""
local EvId = ""
local EvModel = ""
local EvIcon = "materials/sprites/ui/EvidenceIcons/Binder.png"
local EvidenceToolFrame = nil
local ScrollPixels = ""
function AddButton()
for k,v in pairs(NewEvidences) do
			local DButton = ScrollNewEvidence:Add( "DButton" )
			DButton:SetText(v.name)
			DButton:Dock( TOP )
			DButton:SetSize(5, 30)
			DButton:DockMargin( 0, 0, 0, 5 )
			DButton.DoClick = function()
				NameText:SetValue(v.name)
				MainText:SetValue(v.text)
				EvidenceSlider:SetValue(v.vision)
				HTMLText:SetValue(v.html)
				BHTMLText:SetValue(v.bhtml)
			end
		end
end
function TOOL:RightClick( trace )
if(EvidenceToolFrame == nil) then
if(CLIENT) then
		local text = ""
		local int = 5
		local TableHTML = {}
		EvidenceToolFrame = vgui.Create( "DFrame" )
		EvidenceToolFrame:SetSize( ScrW()/2, ScrH()/1.1)
		EvidenceToolFrame:Center()
		EvidenceToolFrame:MakePopup()
		EvidenceToolFrame:SetTitle("Evidence")
		EvidenceToolFrame:ShowCloseButton(true)
		EvidenceToolFrame:SetScreenLock(false)
		EvidenceToolFrame:SetDraggable(false)
		local NameText = vgui.Create("DTextEntry", EvidenceToolFrame)
		NameText:SetPos(EvidenceToolFrame:GetWide()/30, EvidenceToolFrame:GetTall()/15)
		NameText:SetSize(EvidenceToolFrame:GetWide()/2, NameText:GetTall())
		NameText:SetValue(EvText1)
		local NTX = NameText:GetX()
		local MainText = vgui.Create("DTextEntry", EvidenceToolFrame)
		MainText:SetPos(NTX, NameText:GetY()+ NameText:GetTall()*1.5)
		MainText:SetSize(NameText:GetWide(), EvidenceToolFrame:GetTall()/3)
		MainText:SetMultiline(true)
		MainText:SetValue(EvText2)
		local EvidenceSlider = vgui.Create( "DNumSlider", EvidenceToolFrame)
		EvidenceSlider:SetPos( NTX, MainText:GetY() + MainText:GetTall() )				
		EvidenceSlider:SetSize( NameText:GetWide(), NameText:GetTall() )			
		EvidenceSlider:SetText( "Видимость улики" )	
		EvidenceSlider:SetMin( 1 )				 	
		EvidenceSlider:SetMax( 20 )
		EvidenceSlider:SetValue( EvVis )		
		EvidenceSlider:SetDecimals( 0 )	
		local LabelIS = vgui.Create( "DLabel", EvidenceToolFrame )
		LabelIS:SetPos( NTX, EvidenceSlider:GetY() + EvidenceSlider:GetTall() )
		LabelIS:SetText( "Малое изображение(указать url)" )
		LabelIS:SetSize(NameText:GetWide(),NameText:GetTall())
		local HTMLText = vgui.Create("DTextEntry", EvidenceToolFrame)
		HTMLText:SetPos(NTX, LabelIS:GetY() + LabelIS:GetTall())
		HTMLText:SetSize(LabelIS:GetSize())
		HTMLText:SetValue(EvHTML)
		local LabelIB = vgui.Create( "DLabel", EvidenceToolFrame )
		LabelIB:SetPos( NTX, HTMLText:GetY() + HTMLText:GetTall() )
		LabelIB:SetText( "Большое изображение(указать url)" )
		LabelIB:SetSize(LabelIS:GetSize())
		local BHTMLText = vgui.Create("DTextEntry", EvidenceToolFrame)
		BHTMLText:SetPos(NTX, LabelIB:GetY() + LabelIB:GetTall())
		BHTMLText:SetSize(LabelIS:GetSize())
		BHTMLText:SetValue(EvBHTML)
		local LabelM = vgui.Create( "DLabel", EvidenceToolFrame )
		LabelM:SetPos( NTX, BHTMLText:GetY() + BHTMLText:GetTall() )
		LabelM:SetText( "Модель" )
		LabelM:SetSize(LabelIS:GetSize())
		local ModelText = vgui.Create("DTextEntry", EvidenceToolFrame)
		ModelText:SetPos(NTX, LabelM:GetY() + LabelM:GetTall() )
		ModelText:SetSize(LabelIS:GetSize())
		ModelText:SetValue(EvModel)
		local LabelI = vgui.Create( "DLabel", EvidenceToolFrame )
		LabelI:SetPos( NTX, ModelText:GetY() + ModelText:GetTall() )
		LabelI:SetText( "Иконка" )
		LabelI:SetSize(LabelIS:GetWide()/3,LabelIS:GetTall())
		local ButtonIcon = EvidenceToolFrame:Add("DImageButton")	
		ButtonIcon:SetPos(NTX+LabelI:GetWide(), LabelI:GetY())
		ButtonIcon:SetSize(ModelText:GetWide()/5,ModelText:GetWide()/5)
		ButtonIcon:SetImage(EvIcon)
		ButtonIcon.DoClick = function()
			local iconsFrame = EvidenceToolFrame:Add("DFrame")
			iconsFrame:SetSize( ScrW()/3, ScrH()/3*2)
			iconsFrame:Center()
			iconsFrame:MakePopup()
			iconsFrame:SetTitle("Icons")
			iconsFrame:ShowCloseButton(true)
			iconsFrame:SetScreenLock(false)
			iconsFrame:SetDraggable(false)

			local Scroll = iconsFrame:Add("DScrollPanel")
			Scroll:Dock( FILL )

			local List = Scroll:Add("DIconLayout")
			List:Dock( FILL )
			List:SetSpaceY( 5 )
			List:SetSpaceX( 5 )

			local files, directories = file.Find("materials/sprites/ui/EvidenceIcons/*","WORKSHOP")

			for i = 1, #files do 
				local ListItem = List:Add( "DImageButton" ) 
				ListItem:SetSize( 80, 40 ) 
				ListItem:SetImage("sprites/ui/EvidenceIcons/" .. files[i])
				ListItem.DoClick = function()
					ButtonIcon:SetImage("sprites/ui/EvidenceIcons/" .. files[i])
					iconsFrame:Close()
				end
			end
		end
		local ScrollNewEvidence = vgui.Create( "DScrollPanel", EvidenceToolFrame )
		ScrollNewEvidence:SetPos(NameText:GetX()+NameText:GetWide()*1.1, NameText:GetY())
		ScrollNewEvidence:SetSize(EvidenceToolFrame:GetWide()/2.8,EvidenceToolFrame:GetTall()/2)
		if (NewEvidences[1] ~= nil) then 
		for k,v in pairs(NewEvidences) do
			local DButton = ScrollNewEvidence:Add( "DButton" )
			DButton:SetText(v.name)
			DButton:Dock( TOP )
			DButton:SetSize(5, 30)
			DButton:DockMargin( 0, 0, 0, 5 )
			DButton.DoClick = function()
				EvId = v.id
				NameText:SetValue(v.name)
				MainText:SetValue(v.text)
				EvidenceSlider:SetValue(v.vision)
				HTMLText:SetValue(v.html)
				BHTMLText:SetValue(v.bhtml)
				ModelText:SetValue(v.model)
			end
		end
		end
		if(ScrollPixels != "") then
			Vbar = ScrollNewEvidence:GetVBar()
			Vbar:AnimateTo(ScrollPixels,0,0,-1)
		end
		local BGButton = EvidenceToolFrame:Add("DButton")
		BGButton:SetText( "Сохранить" )				
		BGButton:SetPos( NTX, ButtonIcon:GetY() + ButtonIcon:GetTall()*1.1 )			
		BGButton:SetSize( ModelText:GetWide()/2, ModelText:GetTall() )			
		BGButton.DoClick = function()
			local maxLength = 0
			for k,v in pairs(NewEvidences) do
				maxLength = maxLength + 1
			end
			NewEvidences[maxLength+1] = {id = maxLength+1, name = NameText:GetValue(), text = MainText:GetValue(), vision = EvidenceSlider:GetValue(), html = HTMLText:GetValue(), bhtml = BHTMLText:GetValue(), model = ModelText:GetValue(), icon = ButtonIcon:GetImage()}
			net.Start("GetEvidenceText")
			net.WriteString(NameText:GetValue() .. "\n\n"..MainText:GetValue())
			net.WriteInt(EvidenceSlider:GetValue(),6)
			local Table1 = {HTMLText:GetValue(),BHTMLText:GetValue(),ModelText:GetValue(),ButtonIcon:GetImage()}
			net.WriteTable(Table1)
			local DButton = ScrollNewEvidence:Add( "DButton" )
			DButton:SetText(NewEvidences[maxLength+1].name)
			DButton:Dock( TOP )
			DButton:SetSize(5, 30)
			DButton:DockMargin( 0, 0, 0, 5 )
			DButton.DoClick = function()
				EvId = NewEvidences[maxLength+1].id
				NameText:SetValue(NewEvidences[maxLength+1].name)
				MainText:SetValue(NewEvidences[maxLength+1].text)
				EvidenceSlider:SetValue(NewEvidences[maxLength+1].vision)
				HTMLText:SetValue(NewEvidences[maxLength+1].html)
				BHTMLText:SetValue(NewEvidences[maxLength+1].bhtml)
				ModelText:SetValue(NewEvidences[maxLength+1].model)
			end
			net.SendToServer()
		end
		local delButton = EvidenceToolFrame:Add("DButton")
		delButton:SetText( "Удалить" )				
		delButton:SetPos( BGButton:GetX()+BGButton:GetWide()*1.1, BGButton:GetY() )			
		delButton:SetSize( BGButton:GetSize() )	
		delButton.DoClick = function()
			if(EvId~= "") then
				table.remove(NewEvidences,EvId)
				for k,v in pairs(NewEvidences) do
					NewEvidences[k].id = k
				end
				EvId = ""
			end
			ScrollNewEvidence:GetCanvas():Clear()
			if (NewEvidences[1] ~= nil) then 
		for k,v in pairs(NewEvidences) do
			local DButton = ScrollNewEvidence:Add( "DButton" )
			DButton:SetText(v.name)
			DButton:Dock( TOP )
			DButton:SetSize(5, 30)
			DButton:DockMargin( 0, 0, 0, 5 )
			DButton.DoClick = function()
				EvId = v.id
				NameText:SetValue(v.name)
				MainText:SetValue(v.text)
				EvidenceSlider:SetValue(v.vision)
				HTMLText:SetValue(v.html)
				BHTMLText:SetValue(v.bhtml)
				ModelText:SetValue(v.model)
                ButtonIcon:SetImage(v.icon)
			end
		end
		end
		end
		local writeButton = EvidenceToolFrame:Add("DButton")
		writeButton:SetText( "Сохранить изменения" )				
		writeButton:SetPos( NTX, BGButton:GetY() + BGButton:GetTall()*1.1 )			
		writeButton:SetSize( ModelText:GetSize() )	
		writeButton.DoClick = function()
			if(EvId~= "") then
				for k,v in pairs(NewEvidences) do
					if(k==EvId) then
						NewEvidences[k] = {id = k, name = NameText:GetValue(), text = MainText:GetValue(), vision = EvidenceSlider:GetValue(), html = HTMLText:GetValue(), bhtml = BHTMLText:GetValue(), model = ModelText:GetValue(), icon = ButtonIcon:GetImage()}
					end
				end
				ScrollNewEvidence:GetCanvas():Clear()
				for k,v in pairs(NewEvidences) do
					local DButton = ScrollNewEvidence:Add( "DButton" )
					DButton:SetText(v.name)
					DButton:Dock( TOP )
					DButton:SetSize(5, 30)
					DButton:DockMargin( 0, 0, 0, 5 )
					DButton.DoClick = function()
					EvId = v.id
					NameText:SetValue(v.name)
					MainText:SetValue(v.text)
					EvidenceSlider:SetValue(v.vision)
					HTMLText:SetValue(v.html)
					BHTMLText:SetValue(v.bhtml)
					ModelText:SetValue(v.model)
                    ButtonIcon:SetImage(v.icon)
			end
		end
			end
		end
		local delAllButton = EvidenceToolFrame:Add("DButton")
		delAllButton:SetText( "Очистить всё" )				
		delAllButton:SetPos( ScrollNewEvidence:GetX(), ScrollNewEvidence:GetY() + ScrollNewEvidence:GetTall()*1.1 )			
		delAllButton:SetSize( ModelText:GetWide()/2,ModelText:GetTall()*2 )	
		delAllButton.DoClick = function()
				for k,v in pairs(NewEvidences) do
						NewEvidences[k] = nil
				end
				ScrollNewEvidence:GetCanvas():Clear()
				EvId = ""
		end

		local NameTxt = vgui.Create("DComboBox", EvidenceToolFrame)
		NameTxt:SetPos(delAllButton:GetX(), delAllButton:GetY()+delAllButton:GetTall()*1.1)
		NameTxt:SetSize(delAllButton:GetWide(), delAllButton:GetTall()/2)
		NameTxt:SetValue( "Игроки" )
			for k,v in ipairs(player.GetAll()) do
				steamworks.RequestPlayerInfo( v:SteamID64(), function( steamName )
    				NameTxt:AddChoice(v:Nick() .." " .. steamName, v:SteamID())
				end )
			end

		local addPersEvButton = EvidenceToolFrame:Add("DButton")
		addPersEvButton:SetText( "Дать улику" )				
		addPersEvButton:SetPos( NameTxt:GetX(), NameTxt:GetY()+NameTxt:GetTall()*1.1 )			
		addPersEvButton:SetSize( delAllButton:GetSize() )	
		addPersEvButton.DoClick = function()
			local ply
			for k,v in ipairs(player.GetAll()) do
				if (NameTxt:GetOptionData(NameTxt:GetSelectedID()) == v:SteamID()) then
					ply = v
				end
			end
			net.Start("GetPersonalEvidence")
			local str = ""..NameText:GetValue().."\n"..MainText:GetValue()
			net.WriteTable({str,"","",ButtonIcon:GetImage()})
			net.WriteEntity(ply)
			net.SendToServer()
		end
		
		function EvidenceToolFrame:OnRemove()
			EvId = EvId
			EvText1 = NameText:GetValue()
			EvText2 = MainText:GetValue()
			EvVis = EvidenceSlider:GetValue()
			EvHTML = HTMLText:GetValue()
			EvBHTML = BHTMLText:GetValue()
			EvModel = ModelText:GetValue()
			EvIcon = ButtonIcon:GetImage()
			ScrollPixels = ScrollNewEvidence:GetVBar():GetScroll()
			net.Start("GetEvidenceText")
			net.WriteString(NameText:GetValue() .. "\n\n"..MainText:GetValue())
			net.WriteInt(EvidenceSlider:GetValue(),6)
			local Table1 = {HTMLText:GetValue(),BHTMLText:GetValue(), ModelText:GetValue(), ButtonIcon:GetImage()}
			net.WriteTable(Table1)
			EvidenceToolFrame = nil
			net.SendToServer()
		end
		end
		end
end
end

function TOOL.BuildCPanel( panel )

end