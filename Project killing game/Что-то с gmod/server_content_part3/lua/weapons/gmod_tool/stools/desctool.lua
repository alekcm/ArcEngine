TOOL.Category = "DDF"
TOOL.Name = "Desc"
TOOL.Command = nil
TOOL.ConfigName = "" 
 
TOOL.ClientConVar[ "myparameter" ] = "fubar"

local EvidenceToolFrame = nil
local EvidenceText = nil
local EvidenceVision = 0
local ImageSmall = " "
local ImageBig = " "
local EvidenceModel = " "

if SERVER then
util.AddNetworkString("GetEvidenceText1")
util.AddNetworkString("GetNewEvidences")
util.AddNetworkString("SetNewEvidences")
util.AddNetworkString("GetGlobalEvidences")
util.AddNetworkString("GetGlobalEvidences2")
end
function TOOL:LeftClick( trace )
if(SERVER) then
	local button = ents.Create( "desc" )
button:SetPos( trace.HitPos )
button:SetEvidence(EvidenceText)
button:SetHTMLPath(ImageSmall)
button:SetBigHTMLPath(ImageBig)
button:Spawn()
DescText[button] = EvidenceText
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
	net.Receive("GetEvidenceText1",function()
	EvidenceText = net.ReadString()
	EvidenceVision = net.ReadInt(6)
	local table1 = net.ReadTable()
	ImageSmall = table1[1]
	ImageBig = table1[2]
	EvidenceModel = table1[3]
	end)
 end
 
if (CLIENT) then
TOOL.Information = {

		{ name = "info", stage = 1 },
		{ name = "left" },
		{ name = "right" },

	}
language.Add("Tool.desctool.name","DescTool")
language.Add("Tool.desctool.desc","Создание предмета с описанием")
language.Add("Tool.desctool.left","Создать описание в указанной точке.")
language.Add("Tool.desctool.right","Открыть меню создания описания.")
local NewEvidences = {}
local EvText1 = ""
local EvText2 = ""
local EvVis = 5
local EvHTML = ""
local EvBHTML = ""
local EvId = ""
local EvModel = ""
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
		EvidenceToolFrame:SetSize( ScrW()/2.5, ScrH()/2.5*2)
		EvidenceToolFrame:SetPos(ScrW()/4, ScrH()/6)
		EvidenceToolFrame:MakePopup()
		EvidenceToolFrame:SetTitle("Desc")
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
		EvidenceSlider:Hide()
		local LabelIS = vgui.Create( "DLabel", EvidenceToolFrame )
		LabelIS:SetPos( NTX, EvidenceSlider:GetY() + EvidenceSlider:GetTall() )
		LabelIS:SetText( "Малое изображение(Нужно указать url изображения)" )
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
		BGButton:SetPos( NTX, ModelText:GetY() + ModelText:GetTall()*1.1 )			
		BGButton:SetSize( ModelText:GetWide()/2, ModelText:GetTall() )			
		BGButton.DoClick = function()
			local maxLength = 0
			for k,v in pairs(NewEvidences) do
				maxLength = maxLength + 1
			end
			NewEvidences[maxLength+1] = {id = maxLength+1, name = NameText:GetValue(), text = MainText:GetValue(), vision = EvidenceSlider:GetValue(), html = HTMLText:GetValue(), bhtml = BHTMLText:GetValue(), model = ModelText:GetValue()}
			net.Start("GetEvidenceText1")
			net.WriteString(NameText:GetValue() .. "\n\n"..MainText:GetValue())
			net.WriteInt(EvidenceSlider:GetValue(),6)
			local Table1 = {HTMLText:GetValue(),BHTMLText:GetValue(),ModelText:GetValue()}
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
			end
		end
		end
		end
		local writeButton = EvidenceToolFrame:Add("DButton")
		writeButton:SetText( "Сохранить изменения" )				
		writeButton:SetPos( NTX, BGButton:GetY() + BGButton:GetTall()*1.1 )			
		writeButton:SetSize( ModelText:GetSize() )	
		writeButton.DoClick = function()
			print(EvId)
			if(EvId~= "") then
				for k,v in pairs(NewEvidences) do
					if(k==EvId) then
						NewEvidences[k] = {id = k, name = NameText:GetValue(), text = MainText:GetValue(), vision = EvidenceSlider:GetValue(), html = HTMLText:GetValue(), bhtml = BHTMLText:GetValue(), model = ModelText:GetValue()}
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
		function EvidenceToolFrame:OnRemove()
			EvId = EvId
			EvText1 = NameText:GetValue()
			EvText2 = MainText:GetValue()
			EvVis = EvidenceSlider:GetValue()
			EvHTML = HTMLText:GetValue()
			EvBHTML = BHTMLText:GetValue()
			EvModel = ModelText:GetValue()
			ScrollPixels = ScrollNewEvidence:GetVBar():GetScroll()
			net.Start("GetEvidenceText1")
			net.WriteString(NameText:GetValue() .. "\n\n"..MainText:GetValue())
			net.WriteInt(EvidenceSlider:GetValue(),6)
			local Table1 = {HTMLText:GetValue(),BHTMLText:GetValue(), ModelText:GetValue()}
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