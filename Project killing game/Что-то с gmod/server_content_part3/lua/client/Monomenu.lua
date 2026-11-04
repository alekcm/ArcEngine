surface.CreateFont( "DDFFont", {
    font = "CloseCaption_Bold",
    size = (ScrW()+ScrH())/90,
    weight = 700,
    shadow = true,
    extended = true,
} )

local alphabet = {"А", "Б", "В", "Г", "Д", "Е", "Ё", "Ж", "З", "И", "Й", "К", "Л", "М", "Н", "О", "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ", "Ъ", "Ы", "Ь", "Э", "Ю", "Я"}
local countOn = false
local rules = {}
net.Receive("CountMonokuma", function()
        countOn = net.ReadBool()
 end)

local CharList = {{"Akane","Aoi","Celestia","Byakuya","Toko","Imposter","Kaede","Hajime","Maki","Kaito","Rantaro","Kazuichi","Shuichi","Makoto","Nagito","Fuyuhiko"},{true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true},{false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false},{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},{false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false}}
local MonokumaSave = "Monokuma"

local DayUI = Material("sprites/ui/time/day.png")
local NightUI = Material("sprites/ui/time/night.png")
local Day = Material("sprites/ui/time/day text.png")
local Night = Material("sprites/ui/time/night text.png")
local FreeTime = Material("sprites/ui/time/freetime text.png")
local FreeTimeUI = Material("sprites/ui/time/freetime.png")
local Invetigation = Material("sprites/ui/time/investigation text.png")
local InvetigationUI = Material("sprites/ui/time/investigation.png")
DDFChapter = -1
local IsDay = true
local Time = "Start"
local drawNow = true
local function chaptfunc()
    if Time ~= "Execution" then

        surface.SetDrawColor(255, 255, 255, 255)
        surface.SetMaterial(Material("sprites/ui/time/chapter " .. DDFChapter .. ".png"))
        surface.DrawTexturedRect(ScrW()-(629/4*3), 0, 629/4*3, 224/4*3)

    end
end

local function partfunc()

        surface.SetDrawColor(255, 255, 255, 255)
            surface.SetMaterial(Material("sprites/ui/time/"..Time..".png"))
        surface.DrawTexturedRect(ScrW()-(629/4*3), 0, 629/4*3, 224/4*3)

    end
local function timefunc()

        surface.SetDrawColor(255, 255, 255, 255)
        if Time ~= "Execution" then
          if IsDay == true then
    surface.SetMaterial(Day)
            else 
            surface.SetMaterial(Night)
            end
        end
        surface.DrawTexturedRect(ScrW()-(629/4*3), 0, 629/4*3, 224/4*3)

    end

local OnTrial = false
local function drawfunc()
            if drawNow == true and OnTrial == false then
                partfunc()
                timefunc()
                chaptfunc()
                end
            end

    local function SetValues (Values)
    if Values != nil then
    drawNow = Values[1]
    IsDay = Values[2]
    Time = Values[3]
    DDFChapter = Values[4]
        end
    end
local function restartdraw()
     hook.Remove("HUDPaint", "ImageOnTime")
hook.Add("HUDPaint", "ImageOnTime", drawfunc)
    end
net.Receive("NightAnnounsment1", function()
        IsDay=false
        Time = "Night"
        restartdraw()
    end)
net.Receive("MorningAnnounsment1", function()
        IsDay=true
        Time = "Day"
        restartdraw()
    end)
net.Receive("StartTrialDDF", function ()
        timer.Simple(1, function()
        OnTrial = true
        restartdraw()
    end)
        end)
net.Receive("EndTrialDDF", function ()
        timer.Simple(1, function()
        OnTrial = false
        restartdraw()
    end)
        end)
net.Receive("TakeTimeDDF", function()
        local Values = net.ReadTable()
        SetValues(Values)
        restartdraw()
        end)
net.Receive("StartInvestigating2", function()
        Time = "Investigation"
        restartdraw()
        end)
net.Receive("StartExecution", function()
        Time = "Execution"
        restartdraw()
        end)
net.Receive("StartFreetime", function()
        Time = "Day"
        DDFChapter = tostring(tonumber(DDFChapter) + 1)
        restartdraw()
        end)
net.Receive("LiveOnDDF", function ()
        local Values = net.ReadTable()
        SetValues(Values)
        restartdraw()
hook.Remove("HUDPaint", "ImageOnDeath")
    end)

net.Start("ChangeCharList")
net.SendToServer()

net.Start("TimeDDF")
net.SendToServer()

local savesServer
net.Receive("SetSavesServer", function ()
        savesServer = net.ReadTable()
    end)

local f

net.Receive("GetSavesServer", function()

end)

local mainWindow = nil
hook.Add("PlayerButtonDown", "Monomenu", function (ply, button)
    if button == 8 and mainWindow == nil then
        if ply:IsSuperAdmin() then
            net.Start("GetSavesServer")
            net.SendToServer()
            local _NFrame
            mainWindow = vgui.Create( "DFrame" )
            mainWindow:SetSize( ScrW()/1.2, ScrH()/1.2 )
            mainWindow:Center()
            mainWindow:MakePopup()
            
            function mainWindow:OnRemove()
                mainWindow = nil 
                net.Start("SavesServer")
                net.SendToServer()
            end

            local alphPlys = {}
            local plysAll = player.GetAll()
            for i, value in ipairs(alphabet) do
                for p,chr in ipairs(player.GetAll()) do
                    if value == string.sub(chr:Name(), 1,2) then
                        table.insert(alphPlys, chr)  
                    end
                end
            end
            for i, value in ipairs(plysAll) do
                local val = 0
                for p,chr in ipairs(alphPlys) do
                    if chr == value then
                        val = 1
                    end
                end
                if val == 0 then
                    table.insert(alphPlys, value)
                end
            end 

            local mainTabs = mainWindow:Add("DPropertySheet")
            mainTabs:SetSize(mainWindow:GetWide()/1.3,mainWindow:GetTall()/1.1)
            mainTabs:SetPos(mainWindow:GetX()*2, mainWindow:GetY()/2)

            local litigantsPanel = mainTabs:Add("DPanel")
            local scrollLigitants = litigantsPanel:Add("DScrollPanel")
            scrollLigitants:Dock( FILL )

            local sizeButW = mainTabs:GetWide()/5.2
            local sizeButH = mainTabs:GetTall()/7

            local buttonUpdateCount = scrollLigitants:Add("DButton")
            buttonUpdateCount:SetPos(scrollLigitants:GetX(),scrollLigitants:GetY())
            buttonUpdateCount:SetSize(sizeButW,sizeButH)
            buttonUpdateCount:SetText("Обновить суд")
            buttonUpdateCount:SetFont("DDFFont")
            --buttonUpdateCount:SetTextColor(Color(0,0,0))

            local buttonRebuttal = scrollLigitants:Add("DButton")
            buttonRebuttal:SetPos(buttonUpdateCount:GetX()+buttonUpdateCount:GetWide(),scrollLigitants:GetY())
            buttonRebuttal:SetSize(sizeButW,sizeButH)
            buttonRebuttal:SetText("Начать Rebuttal")
            buttonRebuttal:SetFont("DDFFont")
                --buttonRebuttal:SetTextColor(Color(0,0,0))

            local buttonShowSprites = scrollLigitants:Add("DButton")
            buttonShowSprites:SetPos(buttonRebuttal:GetX()+buttonRebuttal:GetWide(),scrollLigitants:GetY())
            buttonShowSprites:SetSize(sizeButW,sizeButH)
            buttonShowSprites:SetText("Показать\nспрятать \nспрайты")
            buttonShowSprites:SetFont("DDFFont")
                --buttonShowSprites:SetTextColor(Color(0,0,0))

            local buttonEndChapter = scrollLigitants:Add("DButton")
            buttonEndChapter:SetPos(buttonShowSprites:GetX()+buttonShowSprites:GetWide(),scrollLigitants:GetY())
            buttonEndChapter:SetSize(sizeButW,sizeButH)
            buttonEndChapter:SetText("Конец главы")
            buttonEndChapter:SetFont("DDFFont")
               -- buttonEndChapter:SetTextColor(Color(0,0,0))

            local buttonEndGame = scrollLigitants:Add("DButton")
            buttonEndGame:SetPos(buttonEndChapter:GetX()+buttonEndChapter:GetWide(),scrollLigitants:GetY())
            buttonEndGame:SetSize(sizeButW,sizeButH)
            buttonEndGame:SetText("Конец игры")
            buttonEndGame:SetFont("DDFFont")
                --buttonEndGame:SetTextColor(Color(0,0,0))

            local buttonSaveLigitants = scrollLigitants:Add("DButton")
            buttonSaveLigitants:SetPos(buttonEndGame:GetX(),scrollLigitants:GetY()+buttonEndGame:GetTall()*2)
            buttonSaveLigitants:SetSize(sizeButW,sizeButH)
            buttonSaveLigitants:SetText("Сохранить")
            buttonSaveLigitants:SetFont("DDFFont")
                --buttonSaveLigitants:SetTextColor(Color(0,0,0))

            local buttonLoadLigitants = scrollLigitants:Add("DButton")
            buttonLoadLigitants:SetPos(buttonEndGame:GetX(),buttonSaveLigitants:GetY()+buttonEndGame:GetTall())
            buttonLoadLigitants:SetSize(sizeButW,sizeButH)
            buttonLoadLigitants:SetText("Загрузить")
            buttonLoadLigitants:SetFont("DDFFont")
                --buttonLoadLigitants:SetTextColor(Color(0,0,0))

            local buttonEditor = scrollLigitants:Add("DButton")
            buttonEditor:SetPos(buttonEndGame:GetX(),buttonLoadLigitants:GetY()+buttonEndGame:GetTall())
            buttonEditor:SetSize(sizeButW,sizeButH)
            buttonEditor:SetText("Участники")
            buttonEditor:SetFont("DDFFont")
                --buttonEditor:SetTextColor(Color(0,0,0))

            local buttonVoting = scrollLigitants:Add("DButton")
            buttonVoting:SetPos(buttonEditor:GetX(),buttonLoadLigitants:GetY()+buttonEndGame:GetTall()*3)
            buttonVoting:SetSize(sizeButW,sizeButH)
            buttonVoting:SetText("Голосование")
            buttonVoting:SetFont("DDFFont")
                --buttonVoting:SetTextColor(Color(0,0,0))

            local buttonsIconLigitants = {}
            local textEntrysLigitants = {}
            local lifeLigitants = {}
            local dieChapter = {}

            local posXcharImage = mainTabs:GetX()/20
            for i=0,3 do
                local posYcharImage = buttonUpdateCount:GetY()+buttonUpdateCount:GetTall()/4
                for j =0,3 do
                    local CharListImage = scrollLigitants:Add("DImageButton")
                        CharListImage:SetSize(mainTabs:GetWide()/7,mainTabs:GetTall()/7)
                        posYcharImage = posYcharImage + CharListImage:GetTall()
                        CharListImage:SetPos(posXcharImage, posYcharImage)

                    local CharListText = vgui.Create("DTextEntry", scrollLigitants)
                        CharListText:SetSize(mainTabs:GetWide()/10,CharListImage:GetTall()/3)
                        CharListText:SetPos(CharListImage:GetX(), CharListImage:GetY()+CharListImage:GetTall())
                    local CharSaveButton = vgui.Create("DButton", scrollLigitants)
                        CharSaveButton:SetSize(mainTabs:GetWide()/14, CharListImage:GetTall()/3)
                        CharSaveButton:SetPos(CharListText:GetX()+CharListText:GetWide(), CharListImage:GetY()+CharListImage:GetTall())
                        CharSaveButton:SetText("Save")
                    local IsAlive = vgui.Create("DCheckBox", CharListImage)
                            IsAlive:SetPos (0, CharListImage:GetTall()/1.8)
                    local DLabelIsAlive = vgui.Create("DLabel", CharListImage)
                            DLabelIsAlive:SetPos(IsAlive:GetWide(),IsAlive:GetY())
                            DLabelIsAlive:SetText("Жив")
                    local IsDeadNow = vgui.Create("DCheckBox", CharListImage)
                            IsDeadNow:SetPos (0, IsAlive:GetY()+IsAlive:GetTall())
                    local DLabelIsDeadNow = vgui.Create("DLabel", CharListImage)
                            DLabelIsDeadNow:SetPos(IsDeadNow:GetWide(),IsDeadNow:GetY())
                            DLabelIsDeadNow:SetSize(100,20)
                            DLabelIsDeadNow:SetText("Умер на этой главе")
                    local IsRebuttal = vgui.Create("DCheckBox", CharListImage)
                            IsRebuttal:SetPos (0, 0)
                    local DLabelIsRebuttal = vgui.Create("DLabel", CharListImage)
                            DLabelIsRebuttal:SetPos(20,0)
                            DLabelIsRebuttal:SetSize(100,20)
                            DLabelIsRebuttal:SetText("Rebuttal")
                    CharListImage.Paint = function(self,w,h)
                        draw.RoundedBox(5,0,0,w,h,Color(10,10,10,200))
                    end
                    CharListText:SetText(CharList[1][j*4+i+1])
                    IsAlive:SetChecked(CharList[2][j*4+i+1])
                    IsDeadNow:SetChecked(CharList[3][j*4+i+1])
                    local CountOfChar = j*4+i+1
                    CharListImage:SetImage("materials/sprites/Face/"..CharListText:GetText()..".png")

                    CharList[5][CountOfChar] = false
                    IsRebuttal.OnChange = function()
                        CharList[5][CountOfChar] = IsRebuttal:GetChecked()
                    end

                    IsAlive.OnChange = function()
                        CharList[2][CountOfChar] = IsAlive:GetChecked()
                    end

                    IsDeadNow.OnChange = function()
                        CharList[3][CountOfChar] = IsDeadNow:GetChecked()
                        if IsDeadNow:GetChecked() == true then
                            IsAlive:SetChecked(false)
                            CharList[2][CountOfChar] = IsAlive:GetChecked()
                        end
                    end

                    CharSaveButton.DoClick = function()
                        CharList[1][CountOfChar] = CharListText:GetText()
                        CharListImage:SetImage("materials/sprites/Face/"..CharListText:GetText()..".png")
                    end
                    buttonsIconLigitants[CountOfChar] = CharListImage
                    textEntrysLigitants[CountOfChar] = CharListText
                    lifeLigitants[CountOfChar] = IsAlive
                    dieChapter[CountOfChar] = IsDeadNow
                    posYcharImage =  posYcharImage + CharListImage:GetTall()/3
                end
                posXcharImage = posXcharImage + mainTabs:GetWide()/5.5
            end

            local MonokumaListImage = scrollLigitants:Add("DImageButton")
                MonokumaListImage:SetSize(mainTabs:GetWide()/7,mainTabs:GetTall()/7)
                MonokumaListImage:SetPos(mainTabs:GetX()*1.3,mainTabs:GetY()*17)
                local MonokumaListText = vgui.Create("DTextEntry", scrollLigitants)
                MonokumaListText:SetSize(100,20)
                MonokumaListText:SetPos(MonokumaListImage:GetX(), MonokumaListImage:GetY()+MonokumaListImage:GetTall())
                MonokumaListText:SetText(MonokumaSave)
                local MonokumaSaveButton = vgui.Create("DButton", scrollLigitants)
                MonokumaSaveButton:SetSize(50, 20)
                MonokumaSaveButton:SetPos(MonokumaListImage:GetX()+MonokumaListImage:GetWide(), MonokumaListImage:GetY()+MonokumaListImage:GetTall())
                MonokumaSaveButton:SetText("Save")
                MonokumaListImage:SetImage("materials/sprites/Face/"..MonokumaListText:GetText()..".png")
                MonokumaSaveButton.DoClick = function()
                    MonokumaListImage:SetImage("materials/sprites/Face/"..MonokumaListText:GetText()..".png")
                    MonokumaSave = MonokumaListText:GetText()
                end
                MonokumaListImage.Paint = function(self,w,h)
                    draw.RoundedBox(5,0,0,w,h,Color(10,10,10,200))
                end

            mainTabs:AddSheet("Суд",litigantsPanel)

            local modelPanel = mainTabs:Add("DPanel")
            local NameText = vgui.Create("DComboBox", modelPanel)
            NameText:SetPos(mainTabs:GetWide()-mainTabs:GetWide()/1.01, mainTabs:GetTall()-mainTabs:GetTall()/1.01)
            NameText:SetSize(mainTabs:GetWide()/6, mainTabs:GetTall()/40)
            NameText:SetValue( "Игроки" )
                for k,v in ipairs(player.GetAll()) do
                    steamworks.RequestPlayerInfo( v:SteamID64(), function( steamName )
                        NameText:AddChoice(v:Nick() .." " .. steamName, v:SteamID())
                    end )
                end
            local Namet = vgui.Create("DLabel", modelPanel)
            Namet:SetPos(NameText:GetX()+NameText:GetWide()*1.1, 0)
            Namet:SetSize(NameText:GetSize())
            Namet:SetText("Имя игрока")
            Namet:SetTextColor(Color(0,0,0))

            local ModelPathText = vgui.Create("DTextEntry", modelPanel)
            ModelPathText:SetPos(NameText:GetX(), NameText:GetY()+NameText:GetTall()*1.4)
            ModelPathText:SetSize(NameText:GetSize())

            local NameModelPath = vgui.Create("DLabel", modelPanel)
            NameModelPath:SetPos(ModelPathText:GetX()+ModelPathText:GetWide()*1.1, ModelPathText:GetY())
            NameModelPath:SetSize(NameText:GetSize())
            NameModelPath:SetText("Путь к модели")
            NameModelPath:SetTextColor(Color(0,0,0))

            local ModelScroll = vgui.Create( "DScrollPanel", modelPanel )
            ModelScroll:SetSize(mainTabs:GetWide()/1.02,mainTabs:GetTall()/2)
            ModelScroll:SetPos(0,mainTabs:GetTall()/2.2)

            local ModelList = vgui.Create( "DIconLayout", ModelScroll )
            ModelList:Dock( FILL )
            ModelList:SetSpaceY( 5 )
            ModelList:SetSpaceX( 5 )

            for name, model in SortedPairs( player_manager.AllValidModels() ) do    
                local icon = ModelList:Add( "SpawnIcon" )
                icon:SetSize( 64, 64 )
                icon:SetModel( model )
                icon:SetTooltip( name )
                icon.DoClick = function()
                    ModelPathText:SetValue(model)
                end   
            end

            local searchModelText = vgui.Create("DTextEntry", modelPanel)
            searchModelText:SetPos(ModelPathText:GetX(), ModelScroll:GetY()-NameText:GetTall()*2)
            searchModelText:SetSize(NameText:GetSize())
            searchModelText:SetTooltip("Введите название модели или его часть. Для начала поиска нажмите ENTER.")
            searchModelText.OnEnter = function()
                ModelList:Clear()
                for i,model in SortedPairs( player_manager.AllValidModels() ) do
                    if(i:lower():find(searchModelText:GetText():lower()) != nil) then
                       local icon = ModelList:Add( "SpawnIcon" )
                        icon:SetSize( 64, 64 )
                        icon:SetModel( model )
                        icon:SetTooltip( name )
                        icon.DoClick = function()
                            ModelPathText:SetValue(model)
                        end  
                    end
                end
            end

            local searchNameText = vgui.Create("DLabel", modelPanel)
            searchNameText:SetPos(searchModelText:GetX(),searchModelText:GetY() - searchModelText:GetTall())
            searchNameText:SetSize(NameText:GetSize())
            searchNameText:SetText("Поиск модели")
            searchNameText:SetTextColor(Color(0,0,0))

            local modelButton = modelPanel:Add("DButton")
            modelButton:SetText( "Сменить модель" )             
            modelButton:SetPos( ModelPathText:GetX(), ModelPathText:GetY() + ModelPathText:GetTall()*2 )            
            modelButton:SetSize( modelPanel:GetWide()*2,modelPanel:GetTall()*2 )         
            modelButton.DoClick = function()
                net.Start("ModelSelector")
                local tbl = {NameText:GetOptionData(NameText:GetSelectedID()),ModelPathText:GetText()}
                net.WriteTable(tbl)
                net.SendToServer()
            end

            mainTabs:AddSheet("Смена модели",modelPanel)

            local timePanel = mainTabs:Add("DPanel")
            
            if _NFrame ~= nil then 
                _NFrame:Remove()
            end

            _NFrame = timePanel
            local DCheckBoxIsDraw = vgui.Create("DCheckBox", timePanel)
            DCheckBoxIsDraw:SetPos(25,50)
            DCheckBoxIsDraw:SetValue(drawNow)
            local DLabelIsDraw = vgui.Create("DLabel", timePanel)
            DLabelIsDraw:SetPos(50,50)
            DLabelIsDraw:SetText("Рисовать?")
                DLabelIsDraw:SetTextColor(Color(0,0,0))
            local DCheckBoxIsDay = vgui.Create("DCheckBox", timePanel)
            DCheckBoxIsDay:SetPos(25,75)
            DCheckBoxIsDay:SetValue(IsDay)
            local DLabelIsDay = vgui.Create("DLabel", timePanel)
            DLabelIsDay:SetPos(50,75)
            DLabelIsDay:SetText("День?")
                DLabelIsDay:SetTextColor(Color(0,0,0))
            local TimeComboBox = vgui.Create( "DComboBox", timePanel )
            TimeComboBox:SetText(DDFChapter)
            TimeComboBox:SetPos(20,100)
            TimeComboBox:SetSize(100,25)
            TimeComboBox:SetSortItems(false)
            TimeComboBox:SetValue("Выберите")
            TimeComboBox:AddChoice( "Start" )
            TimeComboBox:AddChoice( "Day" )
            TimeComboBox:AddChoice( "Night" )
            TimeComboBox:AddChoice( "Investigation" )
            TimeComboBox:AddChoice( "Execution" )
            local DTextEntryPart = vgui.Create("DTextEntry", timePanel)
            DTextEntryPart:SetText(DDFChapter)
            DTextEntryPart:SetPos(25,125)
            DTextEntryPart:SetSize(20,20)
            local DLabelPart = vgui.Create("DLabel", timePanel)
            DLabelPart:SetPos(50,125)
            DLabelPart:SetText("Глава")
                DLabelPart:SetTextColor(Color(0,0,0))
            local DButton1 = vgui.Create("DButton", timePanel)
            DButton1:SetText("Сохранить")
            DButton1:SetPos(25,150)
            DButton1:SetSize(100,20)
            DButton1.DoClick = function()
                IsDay = DCheckBoxIsDay:GetChecked()
                if (TimeComboBox:GetSelected() != nil) then
                    Time = TimeComboBox:GetSelected()
                else
                    Time = TimeComboBox:GetOptionText(2)
                end
                drawNow = DCheckBoxIsDraw:GetChecked()
                DDFChapter = DTextEntryPart:GetText()
                local Values = {drawNow, IsDay, Time, DDFChapter}
                net.Start("SendTimeDDF")
                net.WriteTable(Values)
                net.SendToServer()
            end

            local buttonDayNightOn = vgui.Create("DButton", timePanel)
            buttonDayNightOn:SetText("Включить дневные/ночные уведомления")
            buttonDayNightOn:SetPos(DButton1:GetX(),DButton1:GetY()+DButton1:GetTall()*2)
            buttonDayNightOn:SetSize(timePanel:GetWide()*4,timePanel:GetTall())
            buttonDayNightOn.DoClick = function()
                net.Start("DayNightTurnOn")
                net.SendToServer()
            end

            local buttonDayNightOf = vgui.Create("DButton", timePanel)
            buttonDayNightOf:SetText("Выключить дневные/ночные уведомления")
            buttonDayNightOf:SetPos(buttonDayNightOn:GetX(),buttonDayNightOn:GetY()+buttonDayNightOn:GetTall()*2)
            buttonDayNightOf:SetSize(timePanel:GetWide()*4,timePanel:GetTall())
            buttonDayNightOf.DoClick = function()
                net.Start("DayNightTurnOff")
                net.SendToServer()
            end

            mainTabs:AddSheet("Главы",timePanel)

            local statsPanel = mainTabs:Add("DPanel")

            local scrollStats = statsPanel:Add("DScrollPanel")
            scrollStats:Dock( FILL )

            local scrollPlayersStats = scrollStats:Add("DScrollPanel")
            scrollPlayersStats:SetSize(scrollStats:GetWide()*6,statsPanel:GetTall()*15)
            scrollPlayersStats:SetPos(mainTabs:GetX()/10,mainTabs:GetY()/2)

            local posCheckBoxPlayer = scrollPlayersStats:GetY()
            local checkBoxesPlayers = {}
            local labelsPlayers = {}
            local hmm = {}

            for i, value in ipairs(alphPlys) do
                local DCheckBoxPlayer = scrollPlayersStats:Add("DCheckBox")
                DCheckBoxPlayer:SetChecked(false)
                DCheckBoxPlayer:SetPos(scrollPlayersStats:GetX(),posCheckBoxPlayer)

                checkBoxesPlayers[i] = DCheckBoxPlayer

                local DLabelCheck = scrollPlayersStats:Add("DLabel")
                local DLabelNumbers = scrollPlayersStats:Add("DLabel")
                steamworks.RequestPlayerInfo( value:SteamID64(), function( steamName )
                    DLabelCheck:SetText(value:Nick().." "..steamName, value:SteamID())
                            DLabelCheck:SetTextColor(Color(0,0,0))
                    labelsPlayers[i] = value
                    DLabelNumbers:SetText("HP:"..value:Health().."         MM:"..value:GetNWInt("Monocoins").."  АВ:"..value:GetNWFloat("Avtoritet"))
                    print(value:GetNWInt("Monocoins"))
                    DLabelNumbers:SetTextColor(Color(0,0,0))
                    hmm[value:SteamID()] = DLabelNumbers
                end )
                DLabelCheck:SetPos(DCheckBoxPlayer:GetX()+DCheckBoxPlayer:GetWide()*1.5,posCheckBoxPlayer)
                DLabelCheck:SetSize(scrollPlayersStats:GetWide(),DCheckBoxPlayer:GetTall())
                DLabelNumbers:SetPos(DLabelCheck:GetX()+DLabelCheck:GetWide()/2,DLabelCheck:GetY())
                DLabelNumbers:SetSize(scrollPlayersStats:GetWide(),DCheckBoxPlayer:GetTall())
                posCheckBoxPlayer = posCheckBoxPlayer + DCheckBoxPlayer:GetTall()*1.2
            end

            timer.Create( "HPAndMM", 1, 0, 
                function()
                    if mainWindow == nil then
                        timer.Remove("HPAndMM")
                    else
                        for i, value in ipairs(player.GetAll()) do
                            steamworks.RequestPlayerInfo( value:SteamID64(), function( steamName )
                                hmm[value:SteamID()]:SetText("HP:"..value:Health().."         MM:"..value:GetNWInt("Monocoins").."  АВ:"..value:GetNWFloat("Avtoritet"))
                            end )
                        end
                    end
                end )

            local buttonStats = scrollStats:Add("DButton")
            buttonStats:SetSize(scrollStats:GetWide()*4,scrollStats:GetTall()*2)
            buttonStats:SetPos(scrollPlayersStats:GetX()/10+scrollPlayersStats:GetWide()*1.2,scrollPlayersStats:GetY()/2)
            buttonStats:SetText("Включить/выключить параметры")
            buttonStats.DoClick = function()
                net.Start("CanBeHungryOrNot")
                net.SendToServer()
            end

            local buttonRestartStats = scrollStats:Add("DButton")
            buttonRestartStats:SetSize(scrollStats:GetWide()*4,scrollStats:GetTall()*2)
            buttonRestartStats:SetPos(scrollPlayersStats:GetX()/10+scrollPlayersStats:GetWide()*1.2,scrollPlayersStats:GetY()/2+buttonStats:GetTall()*1.2)
            buttonRestartStats:SetText("Восстановить всем параметры")
            buttonRestartStats.DoClick = function()
                net.Start("RestartFoodForAll")
                net.SendToServer()
            end

            local entryMonocoins = scrollStats:Add("DTextEntry")
            entryMonocoins:SetSize(buttonRestartStats:GetWide()/1.5, buttonRestartStats:GetTall()/2)
            entryMonocoins:SetPos(buttonRestartStats:GetX(),buttonRestartStats:GetY() + buttonRestartStats:GetTall()*1.5)

            local labelFood = scrollStats:Add("DLabel")
            labelFood:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            labelFood:SetPos(scrollPlayersStats:GetX(),scrollPlayersStats:GetY()+scrollPlayersStats:GetTall()*1.2)
            labelFood:SetText("Голод")
                labelFood:SetTextColor(Color(0,0,0))

            local labelWater = scrollStats:Add("DLabel")
            labelWater:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            labelWater:SetPos(scrollPlayersStats:GetX(),labelFood:GetY()+labelFood:GetTall()*1.2)
            labelWater:SetText("Жажда")
                labelWater:SetTextColor(Color(0,0,0))

            local labelSleep = scrollStats:Add("DLabel")
            labelSleep:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            labelSleep:SetPos(scrollPlayersStats:GetX(),labelWater:GetY()+labelWater:GetTall()*1.2)
            labelSleep:SetText("Сон")
                labelSleep:SetTextColor(Color(0,0,0))

            local labelAlcohol = scrollStats:Add("DLabel")
            labelAlcohol:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            labelAlcohol:SetPos(scrollPlayersStats:GetX(),labelSleep:GetY()+labelSleep:GetTall()*1.2)
            labelAlcohol:SetText("Опьянение")
                labelAlcohol:SetTextColor(Color(0,0,0))

            local labelHealth = scrollStats:Add("DLabel")
            labelHealth:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            labelHealth:SetPos(scrollPlayersStats:GetX(),labelAlcohol:GetY()+labelAlcohol:GetTall()*1.2)
            labelHealth:SetText("Здоровье")
                labelHealth:SetTextColor(Color(0,0,0))

            local foodText = scrollStats:Add("DTextEntry")
            foodText:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            foodText:SetPos(scrollPlayersStats:GetX()+labelFood:GetWide()*1.2,scrollPlayersStats:GetY()+scrollPlayersStats:GetTall()*1.2)
            foodText:SetNumeric(true)
            foodText:SetValue(100)

            local waterText = scrollStats:Add("DTextEntry")
            waterText:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            waterText:SetPos(foodText:GetX(),foodText:GetY()+foodText:GetTall()*1.2)
            waterText:SetNumeric(true)
            waterText:SetValue(100)

            local sleepText = scrollStats:Add("DTextEntry")
            sleepText:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            sleepText:SetPos(foodText:GetX(),waterText:GetY()+waterText:GetTall()*1.2)
            sleepText:SetNumeric(true)
            sleepText:SetValue(100)

            local alcoholText = scrollStats:Add("DTextEntry")
            alcoholText:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            alcoholText:SetPos(foodText:GetX(),sleepText:GetY()+sleepText:GetTall()*1.2)
            alcoholText:SetNumeric(true)
            alcoholText:SetValue(0)

            local healthText = scrollStats:Add("DTextEntry")
            healthText:SetSize(scrollStats:GetWide(),scrollStats:GetTall())
            healthText:SetPos(foodText:GetX(),alcoholText:GetY()+alcoholText:GetTall()*1.2)
            healthText:SetNumeric(true)
            healthText:SetValue(100)

            local foodButton = scrollStats:Add("DButton")
            foodButton:SetSize(scrollStats:GetWide()*2,scrollStats:GetTall())
            foodButton:SetPos(foodText:GetX()+foodText:GetWide()*1.2,foodText:GetY())
            foodButton:SetText("Изменить голод")
            foodButton.DoClick = function()
                local tablePlayersStats = {}
                local countPlayersStats = 1
                for i,val in ipairs(checkBoxesPlayers) do
                    if val:GetChecked()==true then
                        tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                        countPlayersStats=countPlayersStats+1
                    end
                end
                net.Start("EditStats")
                net.WriteString("food")
                net.WriteFloat(tonumber(foodText:GetValue()))
                net.WriteTable(tablePlayersStats)
                net.SendToServer()
            end

            local waterButton = scrollStats:Add("DButton")
            waterButton:SetSize(scrollStats:GetWide()*2,scrollStats:GetTall())
            waterButton:SetPos(waterText:GetX()+waterText:GetWide()*1.2,waterText:GetY())
            waterButton:SetText("Изменить жажду")
            waterButton.DoClick = function()
                local tablePlayersStats = {}
                local countPlayersStats = 1
                for i,val in ipairs(checkBoxesPlayers) do
                    if val:GetChecked()==true then
                        tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                        countPlayersStats=countPlayersStats+1
                    end
                end
                net.Start("EditStats")
                net.WriteString("water")
                net.WriteFloat(tonumber(waterText:GetValue()))
                net.WriteTable(tablePlayersStats)
                net.SendToServer()
            end

            local sleepButton = scrollStats:Add("DButton")
            sleepButton:SetSize(scrollStats:GetWide()*2,scrollStats:GetTall())
            sleepButton:SetPos(sleepText:GetX()+sleepText:GetWide()*1.2,sleepText:GetY())
            sleepButton:SetText("Изменить сон")
            sleepButton.DoClick = function()
                local tablePlayersStats = {}
                local countPlayersStats = 1
                for i,val in ipairs(checkBoxesPlayers) do
                    if val:GetChecked()==true then
                        tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                        countPlayersStats=countPlayersStats+1
                    end
                end
                net.Start("EditStats")
                net.WriteString("sleep")
                net.WriteFloat(tonumber(sleepText:GetValue()))
                net.WriteTable(tablePlayersStats)
                net.SendToServer()
            end

            local alcoholButton = scrollStats:Add("DButton")
            alcoholButton:SetSize(scrollStats:GetWide()*2,scrollStats:GetTall())
            alcoholButton:SetPos(alcoholText:GetX()+alcoholText:GetWide()*1.2,alcoholText:GetY())
            alcoholButton:SetText("Изменить опьянение")
            alcoholButton.DoClick = function()
                local tablePlayersStats = {}
                local countPlayersStats = 1
                for i,val in ipairs(checkBoxesPlayers) do
                    if val:GetChecked()==true then
                        tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                        countPlayersStats=countPlayersStats+1
                    end
                end
                net.Start("EditStats")
                net.WriteString("alcohol")
                net.WriteFloat(tonumber(alcoholText:GetValue()))
                net.WriteTable(tablePlayersStats)
                net.SendToServer()
            end

            local healthButton = scrollStats:Add("DButton")
            healthButton:SetSize(scrollStats:GetWide()*2,scrollStats:GetTall())
            healthButton:SetPos(alcoholText:GetX()+healthText:GetWide()*1.2,healthText:GetY())
            healthButton:SetText("Изменить здоровье")
            healthButton.DoClick = function()
                local tablePlayersStats = {}
                local countPlayersStats = 1
                for i,val in ipairs(checkBoxesPlayers) do
                    if val:GetChecked()==true then
                        tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                        countPlayersStats=countPlayersStats+1
                    end
                end
                net.Start("EditHealth")
                net.WriteFloat(tonumber(healthText:GetValue()))
                net.WriteTable(tablePlayersStats)
                net.SendToServer()
            end

            local plusMonocoins = scrollStats:Add("DButton")
            plusMonocoins:SetSize(entryMonocoins:GetWide()/3, entryMonocoins:GetTall()*1.2)
            plusMonocoins:SetPos(entryMonocoins:GetX(), entryMonocoins:GetY() + entryMonocoins:GetTall())
            plusMonocoins:SetText("+")
            plusMonocoins.DoClick = function()
                local tablePlayersStats = {}
                local countPlayersStats = 1
                for i,val in ipairs(checkBoxesPlayers) do
                    if val:GetChecked()==true then
                        tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                        countPlayersStats=countPlayersStats+1
                    end
                end
                net.Start("ChangeMenuMonocoins")
                net.WriteString("+")
                net.WriteInt(tonumber(entryMonocoins:GetValue()),18)
                net.WriteTable(tablePlayersStats)
                net.SendToServer()
            end

            local minusMonocoins = scrollStats:Add("DButton")
            minusMonocoins:SetSize(entryMonocoins:GetWide()/3, entryMonocoins:GetTall()*1.2)
            minusMonocoins:SetPos(entryMonocoins:GetX()+plusMonocoins:GetWide(), entryMonocoins:GetY() + entryMonocoins:GetTall())
            minusMonocoins:SetText("-")
            minusMonocoins.DoClick = function()
                local tablePlayersStats = {}
                local countPlayersStats = 1
                for i,val in ipairs(checkBoxesPlayers) do
                    if val:GetChecked()==true then
                        tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                        countPlayersStats=countPlayersStats+1
                    end
                end
                net.Start("ChangeMenuMonocoins")
                net.WriteString("-")
                net.WriteInt(tonumber(entryMonocoins:GetValue()),18)
                net.WriteTable(tablePlayersStats)
                net.SendToServer()
            end

            local equalMonocoins = scrollStats:Add("DButton")
            equalMonocoins:SetSize(entryMonocoins:GetWide()/3, entryMonocoins:GetTall()*1.2)
            equalMonocoins:SetPos(minusMonocoins:GetX()+minusMonocoins:GetWide(), entryMonocoins:GetY() + entryMonocoins:GetTall())
            equalMonocoins:SetText("=")
            equalMonocoins.DoClick = function()
                local tablePlayersStats = {}
                local countPlayersStats = 1
                for i,val in ipairs(checkBoxesPlayers) do
                    if val:GetChecked()==true then
                        tablePlayersStats[countPlayersStats] = labelsPlayers[i]
                        countPlayersStats=countPlayersStats+1
                    end
                end
                net.Start("ChangeMenuMonocoins")
                net.WriteString("=")
                net.WriteInt(tonumber(entryMonocoins:GetValue()),18)
                net.WriteTable(tablePlayersStats)
                net.SendToServer()
            end

            local labelName = scrollStats:Add("DLabel")
            labelName:SetPos(entryMonocoins:GetX(), entryMonocoins:GetY() + entryMonocoins:GetTall() * 3)
            labelName:SetText("Имя игрока")
            labelName:SetTextColor(Color(0,0,0))

            local namePlayerText = scrollStats:Add("DTextEntry")
            namePlayerText:SetSize(scrollStats:GetWide()*3,scrollStats:GetTall())
            namePlayerText:SetPos(labelName:GetX()+labelName:GetWide()*1.5,labelName:GetY())

            local labelSprite = scrollStats:Add("DLabel")
            labelSprite:SetPos(labelName:GetX(), labelName:GetY() + labelName:GetTall() * 3)
            labelSprite:SetText("Имя спрайта")
            labelSprite:SetTextColor(Color(0,0,0))

            local nameSpriteText = scrollStats:Add("DTextEntry")
            nameSpriteText:SetSize(scrollStats:GetWide()*3,scrollStats:GetTall())
            nameSpriteText:SetPos(labelSprite:GetX()+labelSprite:GetWide()*1.5,labelSprite:GetY())

            local nameSpriteButton = scrollStats:Add("DButton")
            nameSpriteButton:SetSize(labelSprite:GetWide()*2, labelSprite:GetTall())
            nameSpriteButton:SetPos(labelSprite:GetX(), labelSprite:GetY() + labelSprite:GetTall()*2)
            nameSpriteButton:SetText("Добавить имя")
            nameSpriteButton.DoClick = function()
                net.Start("ChangeNameSprite")
                net.WriteTable({namePlayerText:GetValue(),nameSpriteText:GetValue()})
                net.SendToServer()
            end

            mainTabs:AddSheet("Параметры",statsPanel)

            local statsPlysPanel = mainTabs:Add("DPanel")

            local scrollStats2 = statsPlysPanel:Add("DScrollPanel")
            scrollStats2:Dock( FILL )

            local scrollPlayersStats2 = scrollStats2:Add("DScrollPanel")
            scrollPlayersStats2:SetSize(scrollStats:GetWide()*4,statsPanel:GetTall()*14)
            scrollPlayersStats2:SetPos(mainTabs:GetX()/5,mainTabs:GetY()/2)

            local ToLeft = -100

            local inputRunSpeedScaler = scrollStats2:Add("DTextEntry")
            inputRunSpeedScaler:SetSize(inputRunSpeedScaler:GetWide()/2,inputRunSpeedScaler:GetTall())
            inputRunSpeedScaler:SetPos( scrollPlayersStats2:GetX()+ scrollPlayersStats2:GetWide()*1.2, scrollPlayersStats2:GetY())
            inputRunSpeedScaler:SetNumeric(true)
            inputRunSpeedScaler:SetValue(0)

            local textRunSpeedScaler = scrollStats2:Add("DLabel")
            textRunSpeedScaler:SetSize(textRunSpeedScaler:GetWide()*2.5,textRunSpeedScaler:GetTall())
            textRunSpeedScaler:SetPos(inputRunSpeedScaler:GetX()+inputRunSpeedScaler:GetWide()*1.1,inputRunSpeedScaler:GetY())
            textRunSpeedScaler:SetText("Множитель скорости бега")
            textRunSpeedScaler:SetTextColor(Color(0,0,0))

            local inputJumpPowerScaler = scrollStats2:Add("DTextEntry")
            inputJumpPowerScaler:SetSize(inputRunSpeedScaler:GetSize())
            inputJumpPowerScaler:SetPos(inputRunSpeedScaler:GetX(),inputRunSpeedScaler:GetY()+inputRunSpeedScaler:GetTall()*1.3)
            inputJumpPowerScaler:SetNumeric(true)
            inputJumpPowerScaler:SetValue(0)

            local textJumpPowerScaler = scrollStats2:Add("DLabel")
            textJumpPowerScaler:SetSize(textRunSpeedScaler:GetSize())
            textJumpPowerScaler:SetPos(textRunSpeedScaler:GetX(),textRunSpeedScaler:GetY()+textRunSpeedScaler:GetTall()*1.3)
            textJumpPowerScaler:SetText("Множитель силы прыжка")
            textJumpPowerScaler:SetTextColor(Color(0,0,0))

            local inputSlowWalkSpeedScaler = scrollStats2:Add("DTextEntry")
            inputSlowWalkSpeedScaler:SetSize(inputRunSpeedScaler:GetSize())
            inputSlowWalkSpeedScaler:SetPos(inputJumpPowerScaler:GetX(),inputJumpPowerScaler:GetY()+inputJumpPowerScaler:GetTall()*1.3)
            inputSlowWalkSpeedScaler:SetNumeric(true)
            inputSlowWalkSpeedScaler:SetValue(0)

            local textSlowWalkSpeedScaler = scrollStats2:Add("DLabel")
            textSlowWalkSpeedScaler:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textSlowWalkSpeedScaler:SetPos(textJumpPowerScaler:GetX(),textJumpPowerScaler:GetY()+textJumpPowerScaler:GetTall()*1.3)
            textSlowWalkSpeedScaler:SetText("Множитель скорости медленной ходьбы")
            textSlowWalkSpeedScaler:SetTextColor(Color(0,0,0))

            local inputWalkSpeedScaler = scrollStats2:Add("DTextEntry")
            inputWalkSpeedScaler:SetSize(inputRunSpeedScaler:GetSize())
            inputWalkSpeedScaler:SetPos(inputSlowWalkSpeedScaler:GetX(),inputSlowWalkSpeedScaler:GetY()+inputSlowWalkSpeedScaler:GetTall()*1.3)
            inputWalkSpeedScaler:SetNumeric(true)
            inputWalkSpeedScaler:SetValue(0)

            local textWalkSpeedScaler = scrollStats2:Add("DLabel")
            textWalkSpeedScaler:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textWalkSpeedScaler:SetPos(textSlowWalkSpeedScaler:GetX(),textSlowWalkSpeedScaler:GetY()+textSlowWalkSpeedScaler:GetTall()*1.3)
            textWalkSpeedScaler:SetText("Множитель скорости обычной ходьбы")
            textWalkSpeedScaler:SetTextColor(Color(0,0,0))

            local inputFoodScaler = scrollStats2:Add("DTextEntry")
            inputFoodScaler:SetSize(inputRunSpeedScaler:GetSize())
            inputFoodScaler:SetPos(inputWalkSpeedScaler:GetX(),inputWalkSpeedScaler:GetY()+inputWalkSpeedScaler:GetTall()*1.3)
            inputFoodScaler:SetNumeric(true)
            inputFoodScaler:SetValue(0)

            local textFoodScaler = scrollStats2:Add("DLabel")
            textFoodScaler:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textFoodScaler:SetPos(textWalkSpeedScaler:GetX(),textWalkSpeedScaler:GetY()+textWalkSpeedScaler:GetTall()*1.3)
            textFoodScaler:SetText("Множитель голода")
            textFoodScaler:SetTextColor(Color(0,0,0))

            local inputWaterScaler = scrollStats2:Add("DTextEntry")
            inputWaterScaler:SetSize(inputRunSpeedScaler:GetSize())
            inputWaterScaler:SetPos(inputFoodScaler:GetX(),inputFoodScaler:GetY()+inputFoodScaler:GetTall()*1.3)
            inputWaterScaler:SetNumeric(true)
            inputWaterScaler:SetValue(0)

            local textWaterScaler = scrollStats2:Add("DLabel")
            textWaterScaler:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textWaterScaler:SetPos(textFoodScaler:GetX(),textFoodScaler:GetY()+textFoodScaler:GetTall()*1.3)
            textWaterScaler:SetText("Множитель жажды")
            textWaterScaler:SetTextColor(Color(0,0,0))

            local inputSleepScaler = scrollStats2:Add("DTextEntry")
            inputSleepScaler:SetSize(inputRunSpeedScaler:GetSize())
            inputSleepScaler:SetPos(inputWaterScaler:GetX(),inputWaterScaler:GetY()+inputWaterScaler:GetTall()*1.3)
            inputSleepScaler:SetNumeric(true)
            inputSleepScaler:SetValue(0)

            local textSleepScaler = scrollStats2:Add("DLabel")
            textSleepScaler:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textSleepScaler:SetPos(textWaterScaler:GetX(),textWaterScaler:GetY()+textWaterScaler:GetTall()*1.3)
            textSleepScaler:SetText("Множитель сна")
            textSleepScaler:SetTextColor(Color(0,0,0))

            local inputStaminaRestoreScaler = scrollStats2:Add("DTextEntry")
            inputStaminaRestoreScaler:SetSize(inputRunSpeedScaler:GetSize())
            inputStaminaRestoreScaler:SetPos(inputSleepScaler:GetX(),inputSleepScaler:GetY()+inputSleepScaler:GetTall()*1.3)
            inputStaminaRestoreScaler:SetNumeric(true)
            inputStaminaRestoreScaler:SetValue(0)

            local textStaminaRestoreScaler = scrollStats2:Add("DLabel")
            textStaminaRestoreScaler:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textStaminaRestoreScaler:SetPos(textSleepScaler:GetX(),textSleepScaler:GetY()+textSleepScaler:GetTall()*1.3)
            textStaminaRestoreScaler:SetText("Множитель восстановления энергии")
            textStaminaRestoreScaler:SetTextColor(Color(0,0,0))

            local inputStaminaSpendScaler = scrollStats2:Add("DTextEntry")
            inputStaminaSpendScaler:SetSize(inputRunSpeedScaler:GetSize())
            inputStaminaSpendScaler:SetPos(inputStaminaRestoreScaler:GetX(),inputStaminaRestoreScaler:GetY()+inputStaminaRestoreScaler:GetTall()*1.3)
            inputStaminaSpendScaler:SetNumeric(true)
            inputStaminaSpendScaler:SetValue(0)

            local textStaminaSpendScaler = scrollStats2:Add("DLabel")
            textStaminaSpendScaler:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textStaminaSpendScaler:SetPos(textStaminaRestoreScaler:GetX(),textStaminaRestoreScaler:GetY()+textStaminaRestoreScaler:GetTall()*1.3)
            textStaminaSpendScaler:SetText("Множитель траты энергии")
            textStaminaSpendScaler:SetTextColor(Color(0,0,0))

            local inputFallDamage = scrollStats2:Add("DCheckBox")
            inputFallDamage:SetSize(inputRunSpeedScaler:GetWide()/1.5,inputRunSpeedScaler:GetTall()/1.2)
            inputFallDamage:SetPos(inputStaminaSpendScaler:GetX(),inputStaminaSpendScaler:GetY()+inputStaminaSpendScaler:GetTall()*1.3)
            inputFallDamage:SetValue(false)

            local textFallDamage = scrollStats2:Add("DLabel")
            textFallDamage:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textFallDamage:SetPos(textStaminaSpendScaler:GetX(),textStaminaSpendScaler:GetY()+textStaminaSpendScaler:GetTall()*1.3)
            textFallDamage:SetText("Получает ли урон при падении?")
            textFallDamage:SetTextColor(Color(0,0,0))

            local inputHandDamage = scrollStats2:Add("DTextEntry")
            inputHandDamage:SetSize(inputRunSpeedScaler:GetSize())
            inputHandDamage:SetPos(inputFallDamage:GetX(),inputFallDamage:GetY()+inputFallDamage:GetTall()*1.3)
            inputHandDamage:SetNumeric(true)
            inputHandDamage:SetValue(0)

            local textHandDamage = scrollStats2:Add("DLabel")
            textHandDamage:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textHandDamage:SetPos(textFallDamage:GetX(),inputHandDamage:GetY())
            textHandDamage:SetText("Урон с руки (При 0 - стандартное значение)")
            textHandDamage:SetTextColor(Color(0,0,0))

            local inputDamageResistance = scrollStats2:Add("DTextEntry")
            inputDamageResistance:SetSize(inputRunSpeedScaler:GetSize())
            inputDamageResistance:SetPos(inputHandDamage:GetX(),inputHandDamage:GetY()+inputHandDamage:GetTall()*1.3)
            inputDamageResistance:SetNumeric(true)
            inputDamageResistance:SetValue(0)

            local textDamageResistance = scrollStats2:Add("DLabel")
            textDamageResistance:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textDamageResistance:SetPos(textFallDamage:GetX(),inputDamageResistance:GetY())
            textDamageResistance:SetText("Множитель сопротивления урону")
            textDamageResistance:SetTextColor(Color(0,0,0))

            local inputStrDiceAdd = scrollStats2:Add("DTextEntry")
            inputStrDiceAdd:SetSize(inputRunSpeedScaler:GetSize())
            inputStrDiceAdd:SetPos(inputDamageResistance:GetX(),inputDamageResistance:GetY()+inputDamageResistance:GetTall()*1.3)
            inputStrDiceAdd:SetNumeric(true)
            inputStrDiceAdd:SetValue(0)

            local textStrDiceAdd = scrollStats2:Add("DLabel")
            textStrDiceAdd:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textStrDiceAdd:SetPos(textFallDamage:GetX(),inputStrDiceAdd:GetY())
            textStrDiceAdd:SetText("Прибавка к броску силы")
            textStrDiceAdd:SetTextColor(Color(0,0,0))

            local inputDexDiceAdd = scrollStats2:Add("DTextEntry")
            inputDexDiceAdd:SetSize(inputRunSpeedScaler:GetSize())
            inputDexDiceAdd:SetPos(inputDamageResistance:GetX(),inputStrDiceAdd:GetY()+inputStrDiceAdd:GetTall()*1.3)
            inputDexDiceAdd:SetNumeric(true)
            inputDexDiceAdd:SetValue(0)

            local textDexDiceAdd = scrollStats2:Add("DLabel")
            textDexDiceAdd:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textDexDiceAdd:SetPos(textFallDamage:GetX(),inputDexDiceAdd:GetY())
            textDexDiceAdd:SetText("Прибавка к броску ловкости")
            textDexDiceAdd:SetTextColor(Color(0,0,0))

            local inputIntDiceAdd = scrollStats2:Add("DTextEntry")
            inputIntDiceAdd:SetSize(inputRunSpeedScaler:GetSize())
            inputIntDiceAdd:SetPos(inputDamageResistance:GetX(),inputDexDiceAdd:GetY()+inputDexDiceAdd:GetTall()*1.3)
            inputIntDiceAdd:SetNumeric(true)
            inputIntDiceAdd:SetValue(0)

            local textIntDiceAdd = scrollStats2:Add("DLabel")
            textIntDiceAdd:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textIntDiceAdd:SetPos(textFallDamage:GetX(),inputIntDiceAdd:GetY())
            textIntDiceAdd:SetText("Прибавка к броску интеллекта")
            textIntDiceAdd:SetTextColor(Color(0,0,0))

            local inputHealthRestoreScale = scrollStats2:Add("DTextEntry")
            inputHealthRestoreScale:SetSize(inputRunSpeedScaler:GetSize())
            inputHealthRestoreScale:SetPos(inputDamageResistance:GetX(),inputIntDiceAdd:GetY()+inputIntDiceAdd:GetTall()*1.3)
            inputHealthRestoreScale:SetNumeric(true)
            inputHealthRestoreScale:SetValue(0)

            local textHealthRestoreScale = scrollStats2:Add("DLabel")
            textHealthRestoreScale:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textHealthRestoreScale:SetPos(textFallDamage:GetX(),inputHealthRestoreScale:GetY())
            textHealthRestoreScale:SetText("Множитель скорости восстановления здоровья")
            textHealthRestoreScale:SetTextColor(Color(0,0,0))

            local inputEngrammaOf = vgui.Create("DComboBox", scrollStats2)
            inputEngrammaOf:SetSize(inputRunSpeedScaler:GetWide()*2,inputRunSpeedScaler:GetTall())
            inputEngrammaOf:SetPos(scrollPlayersStats2:GetX(),scrollPlayersStats2:GetY()+scrollPlayersStats2:GetTall()*1.3)
            inputEngrammaOf:SetValue( "Выбор" )
            inputEngrammaOf:AddChoice("","")
            inputEngrammaOf:AddChoice("Невидимость","Невидимость")
                for k,v in ipairs(alphPlys) do
                    inputEngrammaOf:AddChoice(v:Nick(),v:Nick())
                end

            local textEngrammaOf = scrollStats2:Add("DLabel")
            textEngrammaOf:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textEngrammaOf:SetPos(inputEngrammaOf:GetX()+inputEngrammaOf:GetWide()*1.2,inputEngrammaOf:GetY())
            textEngrammaOf:SetText(" - единственный игрок, который может нас видеть")
            textEngrammaOf:SetTextColor(Color(0,0,0))

            local inputCurrentCyberpsychosis = scrollStats2:Add("DTextEntry")
            inputCurrentCyberpsychosis:SetSize(inputRunSpeedScaler:GetSize())
            inputCurrentCyberpsychosis:SetPos(inputEngrammaOf:GetX(),inputEngrammaOf:GetY()+inputEngrammaOf:GetTall()*1.3)
            inputCurrentCyberpsychosis:SetNumeric(true)
            inputCurrentCyberpsychosis:SetValue("")

            local textCurrentCyberpsychosis = scrollStats2:Add("DLabel")
            textCurrentCyberpsychosis:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textCurrentCyberpsychosis:SetPos(inputCurrentCyberpsychosis:GetX()+inputCurrentCyberpsychosis:GetWide()*1.3,inputCurrentCyberpsychosis:GetY())
            textCurrentCyberpsychosis:SetText("Текущее безумие")
            textCurrentCyberpsychosis:SetTextColor(Color(0,0,0))

            local inputMaxCyberpsychosis = scrollStats2:Add("DTextEntry")
            inputMaxCyberpsychosis:SetSize(inputRunSpeedScaler:GetSize())
            inputMaxCyberpsychosis:SetPos(inputCurrentCyberpsychosis:GetX(),inputCurrentCyberpsychosis:GetY()+inputCurrentCyberpsychosis:GetTall()*1.3)
            inputMaxCyberpsychosis:SetNumeric(true)
            inputMaxCyberpsychosis:SetValue("")

            local textMaxCyberpsychosis = scrollStats2:Add("DLabel")
            textMaxCyberpsychosis:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textMaxCyberpsychosis:SetPos(inputMaxCyberpsychosis:GetX()+inputMaxCyberpsychosis:GetWide()*1.3,inputMaxCyberpsychosis:GetY())
            textMaxCyberpsychosis:SetText("Максимальное кибербезумие")
            textMaxCyberpsychosis:SetTextColor(Color(0,0,0))

            local inputCanSeeEverybodyInRange = scrollStats2:Add("DTextEntry")
            inputCanSeeEverybodyInRange:SetSize(inputRunSpeedScaler:GetSize())
            inputCanSeeEverybodyInRange:SetPos(inputMaxCyberpsychosis:GetX(),inputMaxCyberpsychosis:GetY()+inputMaxCyberpsychosis:GetTall()*1.3)
            inputCanSeeEverybodyInRange:SetNumeric(true)
            inputCanSeeEverybodyInRange:SetValue("")

            local textCanSeeEverybodyInRange = scrollStats2:Add("DLabel")
            textCanSeeEverybodyInRange:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textCanSeeEverybodyInRange:SetPos(inputCanSeeEverybodyInRange:GetX()+inputCanSeeEverybodyInRange:GetWide()*1.3,inputCanSeeEverybodyInRange:GetY())
            textCanSeeEverybodyInRange:SetText("Суперадмиснкий волхак в радиусе")
            textCanSeeEverybodyInRange:SetTextColor(Color(0,0,0))

            local inputCanSeeOnePerson = scrollStats2:Add("DTextEntry")
            inputCanSeeOnePerson:SetSize(inputRunSpeedScaler:GetWide()*2,inputRunSpeedScaler:GetTall())
            inputCanSeeOnePerson:SetPos(inputMaxCyberpsychosis:GetX(),inputCanSeeEverybodyInRange:GetY()+inputCanSeeEverybodyInRange:GetTall()*1.3)
            inputCanSeeOnePerson:SetValue("")

            local textCanSeeOnePerson = scrollStats2:Add("DLabel")
            textCanSeeOnePerson:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textCanSeeOnePerson:SetPos(inputCanSeeEverybodyInRange:GetX()+inputCanSeeOnePerson:GetWide()*1.3,inputCanSeeOnePerson:GetY())
            textCanSeeOnePerson:SetText(" Вижу его сквозь стены")
            textCanSeeOnePerson:SetTextColor(Color(0,0,0))

            local sendToServerButton = scrollStats2:Add("DButton")
            sendToServerButton:SetSize(textRunSpeedScaler:GetWide(),textRunSpeedScaler:GetTall())
            sendToServerButton:SetPos(textEngrammaOf:GetX()+textEngrammaOf:GetWide()/1.5,textEngrammaOf:GetY())
            sendToServerButton:SetText("Сохранить")

            local inputObservationAdd = scrollStats2:Add("DTextEntry")
            inputObservationAdd:SetSize(inputRunSpeedScaler:GetWide()*2,inputRunSpeedScaler:GetTall())
            inputObservationAdd:SetPos(inputMaxCyberpsychosis:GetX(),inputCanSeeOnePerson:GetY()+inputCanSeeOnePerson:GetTall()*1.3)
            inputObservationAdd:SetValue("")

            local textObservationAdd = scrollStats2:Add("DLabel")
            textObservationAdd:SetSize(textRunSpeedScaler:GetWide()*3,textRunSpeedScaler:GetTall())
            textObservationAdd:SetPos(inputObservationAdd:GetX()+inputObservationAdd:GetWide()*1.3,inputObservationAdd:GetY())
            textObservationAdd:SetText("Добавить внимательность")
            textObservationAdd:SetTextColor(Color(0,0,0))

            local ply1 = nil

            sendToServerButton.DoClick = function()
                if ply1 ~= nil then
                    print(inputEngrammaOf:GetSelectedID())
                    net.Start("SendStats")
                    net.WriteEntity(ply1)
                    net.WriteTable({inputRunSpeedScaler:GetText(),inputJumpPowerScaler:GetText(),inputSlowWalkSpeedScaler:GetText(),inputWalkSpeedScaler:GetText(),inputFoodScaler:GetText(),inputWaterScaler:GetText(),inputSleepScaler:GetText(),inputStaminaRestoreScaler:GetText(),inputStaminaSpendScaler:GetText(),inputFallDamage:GetChecked(),inputHandDamage:GetText(),inputDamageResistance:GetText(),inputStrDiceAdd:GetText(),inputDexDiceAdd:GetText(),inputIntDiceAdd:GetText(),inputHealthRestoreScale:GetText(),inputEngrammaOf:GetOptionData(inputEngrammaOf:GetSelectedID()),inputCurrentCyberpsychosis:GetText(),inputMaxCyberpsychosis:GetText(),inputCanSeeEverybodyInRange:GetText(),inputCanSeeOnePerson:GetText(),inputObservationAdd:GetText()})
                    net.SendToServer()
                end
            end

            for i, ply in ipairs(alphPlys) do
                local DButtonPlayer = scrollPlayersStats2:Add("DButton")
                DButtonPlayer:SetText(ply:Name())
                DButtonPlayer:SetSize(200,20)
                DButtonPlayer:SetPos(0,20*i)
                DButtonPlayer.DoClick = function()
                ply1 = ply
                    inputRunSpeedScaler:SetText(ply:GetNWFloat("RunSpeedScaler"))
                    inputJumpPowerScaler:SetText(ply:GetNWFloat("JumpPowerScaler"))
                    inputSlowWalkSpeedScaler:SetText(ply:GetNWFloat("SlowWalkSpeedScaler"))
                    inputWalkSpeedScaler:SetText(ply:GetNWFloat("WalkSpeedScaler"))
                    inputFoodScaler:SetText(ply:GetNWFloat("FoodScaler"))
                    inputWaterScaler:SetText(ply:GetNWFloat("WaterScaler"))
                    inputSleepScaler:SetText(ply:GetNWFloat("SleepScaler"))
                    inputStaminaRestoreScaler:SetText(ply:GetNWFloat("StaminaRestoreScaler"))
                    inputStaminaSpendScaler:SetText(ply:GetNWFloat("StaminaSpendScaler"))
                    inputFallDamage:SetValue(ply:GetNWFloat("FallDamage"))
                    inputHandDamage:SetText(ply:GetNWFloat("HandDamage"))
                    inputDamageResistance:SetText(ply:GetNWFloat("DamageResistance"))
                    inputStrDiceAdd:SetText(ply:GetNWFloat("StrDiceAdd"))
                    inputDexDiceAdd:SetText(ply:GetNWFloat("DexDiceAdd"))
                    inputIntDiceAdd:SetText(ply:GetNWFloat("IntDiceAdd"))
                    inputHealthRestoreScale:SetText(ply:GetNWFloat("HealthRestoreScale"))
                    local eng = ply:GetNWString("EngrammaOf")
                    inputEngrammaOf:SetValue(eng)
                    for c=1, #alphPlys+2 do
                        if inputEngrammaOf:GetOptionData(c) == eng then
                            inputEngrammaOf:ChooseOptionID(c)
                        end
                    end
                    inputCurrentCyberpsychosis:SetText(ply:GetNWFloat("CurrentCyberpsychosis"))
                    inputMaxCyberpsychosis:SetText(ply:GetNWFloat("MaxCyberpsychosis"))
                    inputCanSeeEverybodyInRange:SetText(ply:GetNWFloat("CanSeeEverybodyInRange"))
                    inputCanSeeOnePerson:SetText(ply:GetNWFloat("CanSeeOnePerson"))
                    inputObservationAdd:SetText(ply:GetNWFloat("ObservationAdd"))
                end
            end

            mainTabs:AddSheet("Статы",statsPlysPanel)

            local weaponPanel = mainTabs:Add("DPanel")

            local scrollWeapons = weaponPanel:Add("DScrollPanel")
            scrollWeapons:Dock( FILL )

            local panelWeapons = scrollWeapons:Add("DPanel")
            panelWeapons:SetPos(scrollWeapons:GetX(),scrollWeapons:GetY())
            panelWeapons:SetSize(ScrW()/1.5,ScrH()/2)

            local weaponsList = list.Get( "Weapon" )

            local searchText = panelWeapons:Add("DTextEntry")
            searchText:SetSize(panelWeapons:GetWide()/6,panelWeapons:GetTall()/18)
            searchText:SetPos(panelWeapons:GetX(),panelWeapons:GetY())
            searchText:SetPlaceholderText("Поиск")

            local scrollCategories = panelWeapons:Add("DScrollPanel")
            scrollCategories:SetSize(panelWeapons:GetWide()/6,panelWeapons:GetTall()/1.1)
            scrollCategories:SetPos(panelWeapons:GetX(),searchText:GetY()+searchText:GetTall())

            local scrollWeaponsCategory = panelWeapons:Add("DScrollPanel")
            scrollWeaponsCategory:SetSize(panelWeapons:GetWide()/1.3,panelWeapons:GetTall()/1.1)
            scrollWeaponsCategory:SetPos(panelWeapons:GetX()+scrollCategories:GetWide(),searchText:GetY()+searchText:GetTall())

            local listWeaponsPanel = vgui.Create( "DIconLayout", scrollWeaponsCategory )
            listWeaponsPanel:SetSize(scrollWeaponsCategory:GetWide(),scrollWeaponsCategory:GetTall())
            listWeaponsPanel:SetSpaceY( 5 )
            listWeaponsPanel:SetSpaceX( 5 )

            local Categorised = {}

            for i,weapon in pairs(weaponsList) do
                if ( !weapon.Spawnable ) then continue end

                local Category = weapon.Category or "Other2"
                if ( !isstring( Category ) ) then Category = tostring( Category ) end

                Categorised[ Category ] = Categorised[ Category ] or {}
                table.insert( Categorised[ Category ], weapon )
            end

            
            local checkBoxesPlayersWeapon = {}
            local labelsPlayersWeapon = {}

            local scrollPlayersWeapons = scrollWeapons:Add("DScrollPanel")
            scrollPlayersWeapons:SetSize(scrollWeapons:GetWide()*3,scrollWeapons:GetTall()*8)
            scrollPlayersWeapons:SetPos(panelWeapons:GetX(),panelWeapons:GetY()+panelWeapons:GetTall()*1.1)
            local posCheckBoxPlayerWeapon = 0

            for i, value in ipairs(alphPlys) do
                local DCheckBoxPlayer = scrollPlayersWeapons:Add("DCheckBox")
                DCheckBoxPlayer:SetChecked(false)
                DCheckBoxPlayer:SetPos(scrollPlayersWeapons:GetX(),posCheckBoxPlayerWeapon)

                checkBoxesPlayersWeapon[i] = DCheckBoxPlayer

                local DLabelCheck = scrollPlayersWeapons:Add("DLabel")
                steamworks.RequestPlayerInfo( value:SteamID64(), function( steamName )
                    DLabelCheck:SetText(value:Nick() .." " .. steamName, value:SteamID())
                            DLabelCheck:SetTextColor(Color(0,0,0))
                    labelsPlayersWeapon[i] = value
                end )
                DLabelCheck:SetPos(DCheckBoxPlayer:GetX()+DCheckBoxPlayer:GetWide()*1.5,posCheckBoxPlayerWeapon)
                DLabelCheck:SetSize(scrollPlayersStats:GetWide(),DCheckBoxPlayer:GetTall())
                posCheckBoxPlayerWeapon = posCheckBoxPlayerWeapon + DCheckBoxPlayer:GetTall()*1.2
            end

            local buttonCategoryHeight = 0
            for CategoryName, v in SortedPairs( Categorised ) do
                local buttonCategory = scrollCategories:Add("DButton")
                buttonCategory:SetPos(scrollCategories:GetX(),buttonCategoryHeight)
                buttonCategory:SetSize(scrollCategories:GetWide(),scrollCategories:GetTall()/15)
                buttonCategory:SetText(CategoryName)
                    
                buttonCategoryHeight = buttonCategoryHeight + buttonCategory:GetTall()
                buttonCategory.DoClick = function()
                    listWeaponsPanel:Clear()
                    for i,weap in pairs(v) do
                        local buttonWeapon = listWeaponsPanel:Add("DImageButton")
                        buttonWeapon:SetSize(buttonWeapon:GetWide()*2,buttonWeapon:GetTall()*4)
                        buttonWeapon:SetImage("entities/" .. weap.ClassName .. ".png","vgui/entities/" .. weap.ClassName .. ".png")
                        buttonWeapon.DoClick = function()
                            local tablePlayersWeapon = {}
                            local countPlayersWeapon = 1
                            for i,val in ipairs(checkBoxesPlayersWeapon) do
                                if val:GetChecked()==true then
                                    tablePlayersWeapon[countPlayersWeapon] = labelsPlayersWeapon[i]
                                    countPlayersWeapon=countPlayersWeapon+1
                                end
                            end
                                                
                            net.Start("SetWeaponPlayer")
                            net.WriteTable(tablePlayersWeapon)
                            net.WriteString(weap.ClassName)
                            net.SendToServer()
                        end
                        local panelNameWeapon = buttonWeapon:Add("DPanel")
                        panelNameWeapon:SetSize(buttonWeapon:GetWide(),panelNameWeapon:GetTall()/1.15)
                        panelNameWeapon:SetPos(panelNameWeapon:GetX(),buttonWeapon:GetTall()/1.2)
                        local labelNameWeapon = panelNameWeapon:Add("DLabel")
                        labelNameWeapon:SetText(weap.PrintName)
                        labelNameWeapon:SetSize(panelNameWeapon:GetWide(),panelNameWeapon:GetTall())
                        labelNameWeapon:SetPos(labelNameWeapon:GetX()+panelNameWeapon:GetWide()/4,labelNameWeapon:GetY())
                        labelNameWeapon:SetColor(Color(255,0,0))
                    end
                end
            end

            searchText.OnEnter = function()
                listWeaponsPanel:Clear()
                for i,weap in pairs(weaponsList) do
                    if ( !weap.Spawnable ) then continue end
                    if(weap.PrintName:find(searchText:GetText()) != nil) then
                        local buttonWeapon = listWeaponsPanel:Add("DImageButton")
                        buttonWeapon:SetSize(buttonWeapon:GetWide()*2,buttonWeapon:GetTall()*4)
                        buttonWeapon:SetImage("entities/" .. weap.ClassName .. ".png","vgui/entities/" .. weap.ClassName .. ".png")
                        buttonWeapon.DoClick = function()
                            local tablePlayersWeapon = {}
                            local countPlayersWeapon = 1
                            for i,val in ipairs(checkBoxesPlayersWeapon) do
                                if val:GetChecked()==true then
                                    tablePlayersWeapon[countPlayersWeapon] = labelsPlayersWeapon[i]
                                    countPlayersWeapon=countPlayersWeapon+1
                                end
                            end
                            net.Start("SetWeaponPlayer")
                            net.WriteTable(tablePlayersWeapon)
                            net.WriteString(weap.ClassName)
                            net.SendToServer()
                        end
                        local panelNameWeapon = buttonWeapon:Add("DPanel")
                        panelNameWeapon:SetSize(buttonWeapon:GetWide(),panelNameWeapon:GetTall()/1.15)
                        panelNameWeapon:SetPos(panelNameWeapon:GetX(),buttonWeapon:GetTall()/1.2)
                        local labelNameWeapon = panelNameWeapon:Add("DLabel")
                        labelNameWeapon:SetText(weap.PrintName)
                        labelNameWeapon:SetSize(panelNameWeapon:GetWide(),panelNameWeapon:GetTall())
                        labelNameWeapon:SetPos(labelNameWeapon:GetX()+panelNameWeapon:GetWide()/4,labelNameWeapon:GetY())
                        labelNameWeapon:SetColor(Color(255,0,0))
                    end
                end
            end

            local buttonMonokumaEquip = scrollWeapons:Add("DButton")
            buttonMonokumaEquip:SetSize(scrollWeapons:GetWide()*3,scrollWeapons:GetTall()*2)
            buttonMonokumaEquip:SetPos(scrollPlayersWeapons:GetX()+scrollPlayersWeapons:GetWide(),scrollPlayersWeapons:GetY())
            buttonMonokumaEquip:SetText("Набор монокумы")
            buttonMonokumaEquip.DoClick = function()
                net.Start("SetMonokumaWeapon")
                net.SendToServer()
            end

            local buttonHandsEquip = scrollWeapons:Add("DButton")
            buttonHandsEquip:SetSize(scrollWeapons:GetWide()*3,scrollWeapons:GetTall()*2)
            buttonHandsEquip:SetPos(scrollPlayersWeapons:GetX()+scrollPlayersWeapons:GetWide(),scrollPlayersWeapons:GetY()+scrollWeapons:GetTall()*2+5)
            buttonHandsEquip:SetText("Выдать ключи")
            buttonHandsEquip.DoClick = function()
                net.Start("GiveKey")
                net.SendToServer()
            end
                        local buttonHandsEquip = scrollWeapons:Add("DButton")
            buttonHandsEquip:SetSize(scrollWeapons:GetWide()*3,scrollWeapons:GetTall()*2)
            buttonHandsEquip:SetPos(scrollPlayersWeapons:GetX()+scrollPlayersWeapons:GetWide(),scrollPlayersWeapons:GetY()+scrollWeapons:GetTall()*4+10)
            buttonHandsEquip:SetText("Выдать монопады")
            buttonHandsEquip.DoClick = function()
                net.Start("GiveMonopad")
                net.SendToServer()
            end

            mainTabs:AddSheet("Оружие",weaponPanel)

            local rulesPanel = mainTabs:Add("DPanel")

            local verticalScrollRulePanel = rulesPanel:Add("DScrollPanel")
            verticalScrollRulePanel:SetSize(mainTabs:GetSize())

            local layout = verticalScrollRulePanel:Add("DListLayout")
            layout:SetSize(mainTabs:GetWide()/1.2,mainTabs:GetTall()/2)
            layout:SetPos(mainTabs:GetWide()-layout:GetWide(), 0)

            layout:SetPaintBackground(true)
            layout:SetBackgroundColor(Color(0, 100, 100))

            layout:MakeDroppable( "unique_name" )

            local ruleEdit = verticalScrollRulePanel:Add("DTextEntry")
            ruleEdit:SetSize(mainTabs:GetWide()-layout:GetWide(),mainTabs:GetTall()/4)
            ruleEdit:SetMultiline(true)

            local ruleEditing = nil

            net.Start("GetRules")
            net.SendToServer()
            net.Receive("UserRules", function ()
                rules = net.ReadTable()
                for i = 1, #rules do
                    local rule = layout:Add( Label( rules[i] ) )
                    function rule:DoClick()
                        ruleEdit:SetText(rules[i])
                        ruleEditing = rule
                    end
                end
            end)

            local addRuleButton = verticalScrollRulePanel:Add("DButton")
            addRuleButton:SetSize(ruleEdit:GetWide(),ruleEdit:GetTall()/3)
            addRuleButton:SetPos(0,0+ruleEdit:GetTall())
            addRuleButton:SetText("Добавить правило")
            addRuleButton.DoClick = function()
                local rule = layout:Add( Label( "Новое правило" ) )
                function rule:DoClick()
                    ruleEdit:SetText(rule:GetText())
                    ruleEditing = rule
                end
            end

            local delRuleButton = verticalScrollRulePanel:Add("DButton")
            delRuleButton:SetSize(ruleEdit:GetWide(),ruleEdit:GetTall()/3)
            delRuleButton:SetPos(0,addRuleButton:GetY()+addRuleButton:GetTall())
            delRuleButton:SetText("Удалить правило")
            delRuleButton.DoClick = function()
                ruleEditing:Remove()
            end

            local saveRuleButton = verticalScrollRulePanel:Add("DButton")
            saveRuleButton:SetSize(ruleEdit:GetWide(),ruleEdit:GetTall()/3)
            saveRuleButton:SetPos(0,delRuleButton:GetY()+delRuleButton:GetTall())
            saveRuleButton:SetText("Сохранить правила")
            saveRuleButton.DoClick = function()
                local newRules = layout:GetChildren()
                local setRules = {}

                if(file.Exists("RulesDDF", "DATA")) then
                    if(file.Exists("RulesDDF/RulesDDF.txt", "DATA")) then
                        local f = file.Open( "RulesDDF/RulesDDF.txt", "w", "DATA" )
                            for i =1, #newRules do
                                file.Append( "RulesDDF/RulesDDF.txt", newRules[i]:GetText() )
                                file.Append( "RulesDDF/RulesDDF.txt", "\n" )
                            end
                        f:Close()
                    else
                        local f = file.Open( "RulesDDF/RulesDDF.txt", "w", "DATA" )
                            for i =1, #newRules do
                                file.Append( "RulesDDF/RulesDDF.txt", newRules[i]:GetText() )
                                file.Append( "RulesDDF/RulesDDF.txt", "\n" )
                            end
                        f:Close()
                    end
                else
                    file.CreateDir("RulesDDF")
                    local f = file.Open( "RulesDDF/RulesDDF.txt", "w", "DATA" )
                        for i =1, #newRules do
                            file.Append( "RulesDDF/RulesDDF.txt", newRules[i]:GetText() )
                            file.Append( "RulesDDF/RulesDDF.txt", "\n" )
                        end
                    f:Close()
                end

                for i=1, #newRules do
                    setRules[i] = newRules[i]:GetText()
                end

                net.Start("MonoRules")
                net.WriteTable(setRules)
                net.SendToServer()
            end

            local loadFileRuleButton = verticalScrollRulePanel:Add("DButton")
            loadFileRuleButton:SetSize(ruleEdit:GetWide(),ruleEdit:GetTall()/3)
            loadFileRuleButton:SetPos(0,saveRuleButton:GetY()+saveRuleButton:GetTall())
            loadFileRuleButton:SetText("Загрузить правила")
            loadFileRuleButton.DoClick = function()
                if(file.Exists("RulesDDF/RulesDDF.txt", "DATA")) then
                    local delRules = layout:GetChildren()
                    for i =1, #delRules do
                        delRules[i]:Remove()
                    end
                    local value = file.Open( "RulesDDF/RulesDDF.txt", "r","DATA")
                    while !value:EndOfFile() do
                        local kpop = value:ReadLine():gsub("\n", "")
                        local rule = layout:Add( Label( kpop ) )
                        function rule:DoClick()
                            ruleEdit:SetText(rule:GetText())
                            ruleEditing = rule
                        end
                    end
                end
            end

            ruleEdit.OnLoseFocus = function( self )
                if(ruleEditing!=nil and ruleEditing:IsValid()) then
                    ruleEditing:SetText(self:GetText())
                end
            end

            mainTabs:AddSheet("Правила",rulesPanel)

            local savePanel = mainTabs:Add("DPanel")

            local verticalScrollSavePanel = savePanel:Add("DScrollPanel")
            verticalScrollSavePanel:SetSize(mainTabs:GetWide()/2,mainTabs:GetTall())

            --[[for i=1,#f do
                local buttonSave = verticalScrollSavePanel:Add("DButton")
                buttonSave:SetText(f[i])
                buttonSave:Dock( TOP )
                buttonSave:DockMargin( 0, 0, 0, 5 )
                buttonSave.DoClick = function()
                    net.Start("LoadSaveMap")
                    net.WriteString(buttonSave:GetText())
                    net.SendToServer()
                end
            end]]--

            mainTabs:AddSheet("Сохранения",savePanel)

            local radioPanel = mainTabs:Add("DPanel")

            local radioTextEntery = radioPanel:Add("DTextEntry")
            radioTextEntery:SetSize(200,20)
            radioTextEntery:SetPos(50,50)
            radioTextEntery:SetTooltip("Youtube URL")

            local NameText = vgui.Create("DComboBox", radioPanel)
            NameText:SetPos(radioTextEntery:GetX(), radioTextEntery:GetY()-radioTextEntery:GetTall())
            NameText:SetSize(mainTabs:GetWide()/6, mainTabs:GetTall()/40)
            NameText:SetValue( "All players" )
            NameText:AddChoice("All players", "All players")
            for k,v in ipairs(player.GetAll()) do
                steamworks.RequestPlayerInfo( v:SteamID64(), function( steamName )
                    NameText:AddChoice(v:Nick() .." " .. steamName, v:SteamID())
                end )
            end

            local radioButton = radioPanel:Add("DButton")
            radioButton:SetSize(100,20)
            radioButton:SetPos(50, 75)
            radioButton:SetText("Отправить URL")
            radioButton.DoClick = function()
            net.Start("SendSongToServer")
            net.WriteString(radioTextEntery:GetText())
            net.SendToServer()
            end
            local stopRadioButton = radioPanel:Add("DButton")
            stopRadioButton:SetSize(100,20)
            stopRadioButton:SetPos(50, 100)
            stopRadioButton:SetText("Остановить")
            stopRadioButton.DoClick = function()
            net.Start("StopSong1")
            net.SendToServer()
            end
            local autoRadioButton = radioPanel:Add("DButton")
            autoRadioButton:SetSize(100,20)
            autoRadioButton:SetPos(50, 125)
            autoRadioButton:SetText("Вкл. авто смену музыки")
            autoRadioButton.DoClick = function()
            net.Start("autoRadio")
            net.WriteBool(true)
            net.SendToServer()
            end
            local autoRadioButtonOff = radioPanel:Add("DButton")
            autoRadioButtonOff:SetSize(100,20)
            autoRadioButtonOff:SetPos(50, 150)
            autoRadioButtonOff:SetText("Выкл. авто смену музыки")
            autoRadioButtonOff.DoClick = function()
            net.Start("autoRadio")
            net.WriteBool(false)
            net.SendToServer()
            end
            local files, directories = file.Find( "sound/newmusic/*", "WORKSHOP" )
            local str = 1
            local tall = radioButton:GetY()
            for i=1,#directories do
                local musicButton = radioPanel:Add("DButton")
                musicButton:SetSize(100,20)
                if str<4 then
                    musicButton:SetPos(radioButton:GetX()+radioButton:GetWide()*1.2*str, tall)
                    str = str+1
                else
                    str=1
                    tall = tall+radioTextEntery:GetTall()*1.3
                    musicButton:SetPos(radioButton:GetX()+radioButton:GetWide()*1.2*str, tall)
                    str = str+1
                end
                musicButton:SetText(directories[i])
                musicButton.DoClick = function()
                    local que = "All players"
                    if (NameText:GetOptionData(NameText:GetSelectedID()) == "All players" or NameText:GetOptionData(NameText:GetSelectedID())==nil) then
                        net.Start("StartChosenSong")
                        local tbl = {que,directories[i]}
                        net.WriteTable(tbl)
                        net.SendToServer()
                    else
                        net.Start("StartChosenSong")
                        local tbl = {NameText:GetOptionData(NameText:GetSelectedID()),directories[i]}
                        net.WriteTable(tbl)
                        net.SendToServer()
                    end
                end
            end

            mainTabs:AddSheet("Радио",radioPanel)

            local chatsPanel = mainTabs:Add("DPanel")
            chatsPanel:SetSize(ScrW()/25,ScrH()/38)

            net.Start("GetChats3")
            net.SendToServer()

            net.Receive("GetChats4", function()
            local chatListTable = net.ReadTable()

            local writeFrame = chatsPanel:Add("DFrame")
            writeFrame:SetPos(chatsPanel:GetX()*2,chatsPanel:GetY()*2)
            writeFrame:ShowCloseButton(false)
            writeFrame:SetTitle("")
            writeFrame:SetSize(chatsPanel:GetWide()*4,chatsPanel:GetTall()*25)
            writeFrame:SetVerticalScrollbarEnabled(true)
            writeFrame:SetPaintBorderEnabled(false)
            writeFrame:SetDraggable(false)
            writeFrame.Paint = function()
                surface.SetDrawColor(140,140,140,255)
                surface.DrawRect(0, 0, writeFrame:GetWide()/1.05, writeFrame:GetTall()/1.038)
                surface.SetDrawColor(255, 255, 255,255)
                surface.DrawRect(writeFrame:GetX()/8, writeFrame:GetY()/20, writeFrame:GetWide()/1.075, writeFrame:GetTall()/1.11)
            end

            local maxNotes = 1

            local scrollNotesFrame = chatsPanel:Add("DFrame")
            scrollNotesFrame:SetPos(writeFrame:GetWide()*1.05,writeFrame:GetY())
            scrollNotesFrame:ShowCloseButton(false)
            scrollNotesFrame:SetTitle("")
            scrollNotesFrame:SetSize(chatsPanel:GetWide()*12,writeFrame:GetTall())
            scrollNotesFrame:SetVerticalScrollbarEnabled(true)
            scrollNotesFrame:SetPaintBorderEnabled(false)
            scrollNotesFrame:SetDraggable(false)
            scrollNotesFrame.Paint = function()
                surface.SetDrawColor(140,140,140,255)
                surface.DrawRect(0, 0, scrollNotesFrame:GetWide()/1.05, scrollNotesFrame:GetTall()/1.038)
                surface.SetDrawColor(255, 255, 255,255)
                surface.DrawRect(writeFrame:GetX()/8, writeFrame:GetY()/20, scrollNotesFrame:GetWide()/1.06, scrollNotesFrame:GetTall()/1.11)
            end

            ButtonNow = {}

            local сhatList = writeFrame:Add("DScrollPanel")
            сhatList:SetPos(writeFrame:GetX()/4, writeFrame:GetY()/12)
            сhatList:SetSize(writeFrame:GetWide()/1.1,writeFrame:GetTall()/1.11)

            local showMoreFrame = nil



            local n

            local currentChatId = -1
            local notesList = scrollNotesFrame:Add("DScrollPanel")
            notesList:SetPos(writeFrame:GetX()/8, writeFrame:GetY()/20)
            notesList:SetSize(scrollNotesFrame:GetWide()/1.06,scrollNotesFrame:GetTall()/1.11)
            local function GetTime(time)
                if time == nil then
                    time = 0
                end
                local hour = math.floor(time / 150)
                local minute = math.floor((time - hour * 150)/150*60)
                if minute < 10 then
                    minute = "0"..minute
                end
                return hour, minute
            end
            local function UpdateChat()
                    сhatList:Clear()

                    for i = 3, #chatListTable do
                                local noteButton = сhatList:Add( "DButton" )
                                noteButton:SetText( chatListTable[i]["Name"] )
                                noteButton:Dock( TOP )
                                noteButton:DockMargin( 0, 0, 0, 5 )
                                local id = chatListTable[i]["id"]
                                
                                noteButton.DoClick = function()
                                noteButton:SetFont("DermaDefault")
                                --noteButton:SetTextColor(Color(0,0,0))
                                    currentChatId = id
                                    notesList:Clear()
                                    for p = 1, #chatListTable[id]["Messages"] do
                                        if chatListTable[id]["Messages"][p]["Character"] == "Server" then
                                            local Panel = notesList:Add( "DFrame" )
                                            Panel:SetDraggable( false)
                                            Panel:SetSize( scrollNotesFrame:GetWide()/1.06, 25 )
                                            local hour, minute = GetTime(chatListTable[id]["Messages"][p]["Time"])
                                            Panel:SetTitle(chatListTable[id]["Messages"][p]["Text"].." ["..hour..":"..minute.."]")
                                            Panel:Dock( TOP )
                                            Panel:DockMargin( 0, 0, 0, 0)
                                            Panel:ShowCloseButton(false)
                                        else
                                            local Panel = notesList:Add( "DFrame" )
                                            Panel:SetDraggable( false )
                                            Panel:SetSize( scrollNotesFrame:GetWide()/1.06, 100 )
                                            local hour, minute = GetTime(chatListTable[id]["Messages"][p]["Time"])
                                            Panel:SetTitle(chatListTable[id]["Messages"][p]["Character"].." ["..hour..":"..minute.."]")
                                            Panel:Dock( TOP )
                                            Panel:DockMargin( 0, 0, 0, 0)
                                            Panel:ShowCloseButton(false)
                                            local CharFace = Panel:Add("DImage")
                                            CharFace:SetSize( 70, 70 )
                                            CharFace:SetPos(5,25)
                                            local name = GetSpriteFolder(chatListTable[id]["Messages"][p]["Character"])
                                            CharFace:SetImage("sprites/face/"..name..".png")
                                            local DTextEntry = vgui.Create( "DTextEntry", Panel )
                                            DTextEntry:SetSize( Panel:GetWide()-95, Panel:GetTall()-25 )
                                            DTextEntry:SetPos( 80, 25)
                                            DTextEntry:SetDisabled(true)
                                            DTextEntry:SetText( chatListTable[id]["Messages"][p]["Text"] )
                                            DTextEntry:SetMultiline( true )
                                        end
                                    end
                                end
                    end
            end
            UpdateChat()
        end)

            mainTabs:AddSheet("Чаты",chatsPanel)

            local newCountPanel = mainTabs:Add("DPanel")

            local verticalScrollNewCountPanel = newCountPanel:Add("DScrollPanel")
            verticalScrollNewCountPanel:SetSize(mainTabs:GetWide()/2,mainTabs:GetTall())

            local updateNewCount = verticalScrollNewCountPanel:Add("DButton")
            updateNewCount:SetText( "Новый суд" )             
            updateNewCount:SetPos( updateNewCount:GetX(), updateNewCount:GetY() + updateNewCount:GetTall()*2 )            
            updateNewCount:SetSize( updateNewCount:GetWide()*2,updateNewCount:GetTall()*2 )         
            updateNewCount.DoClick = function()
                net.Start("SetNewCount")
                net.SendToServer()
            end

            local loadNewCount = verticalScrollNewCountPanel:Add("DButton")
            loadNewCount:SetText( "Загрузить суд" )             
            loadNewCount:SetPos( updateNewCount:GetX(), updateNewCount:GetY() + updateNewCount:GetTall() )            
            loadNewCount:SetSize( updateNewCount:GetWide(),updateNewCount:GetTall())         

            mainTabs:AddSheet("Кастомный суд",newCountPanel)

            buttonUpdateCount.DoClick = function ()
                net.Start("SendCharList")
                net.WriteTable(CharList)
                net.SendToServer()
                net.Start("RestartCharCameras")
                net.SendToServer()
                timer.Simple(0.01, function()
                    net.Start("SetTrial")
                    net.WriteString(MonokumaSave)
                    net.SendToServer()
                end)
            end

            loadNewCount.DoClick = function()
                if(file.Exists("CountDDF/CountDDF.txt", "DATA")) then
                    local vectorAngle = 0
                    local tableSpritePosAngle = {}
                    local SpritePosAngle = {}
                    local value = file.Open( "CountDDF/CountDDF.txt", "r","DATA")
                    while !value:EndOfFile() do
                        local spritePos = value:ReadLine():gsub("\n", "")
                        if vectorAngle == 0 then
                            spritePos = Vector(spritePos)
                            vectorAngle = 1
                            table.insert(SpritePosAngle,spritePos)
                        else
                            spritePos = Angle(spritePos)
                            vectorAngle = 0
                            table.insert(SpritePosAngle,spritePos)
                            table.insert(tableSpritePosAngle,{SpritePosAngle[1],SpritePosAngle[2]})
                            SpritePosAngle = {}
                        end
                    end
                    net.Start("loadTxtNewCount")
                    net.WriteTable(tableSpritePosAngle)
                    net.SendToServer()
                end
            end

            buttonRebuttal.DoClick = function ()
            local first = true
            local second = true
                for i = 1,16 do
                    if CharList[5][i] == true then
                        if first == true then
                        net.Start("StartFirstRebuttal")
                        net.WriteString(CharList[1][i])
                        net.SendToServer()
                        first = false
                        elseif second == true then
                        net.Start("StartSecondRebuttal")
                        net.WriteString(CharList[1][i])
                        net.SendToServer()
                        second = false
                        end
                    end
                end
            end

            buttonShowSprites.DoClick = function()
                net.Start("SendMessageToSwapTables")
                net.SendToServer()
            end

            buttonEndChapter.DoClick = function ()
                net.Start("SendCharList")
                net.WriteTable(CharList)
                net.SendToServer()
                net.Start("EndOfChapter")
                net.WriteBool(false)
                net.SendToServer()
                for i = 1,16 do
                    CharList[3][i] = false
                    dieChapter[i] = false
                end
                net.Start("SendCharList")
                net.WriteTable(CharList)
                net.SendToServer()
                mainWindow:Close()
            end

            buttonEndGame.DoClick = function ()
                net.Start("SendCharList")
                net.WriteTable(CharList)
                net.SendToServer()
                net.Start("EndOfChapter")
                net.WriteBool(true)
                net.SendToServer()
                mainWindow:Close()
            end

            buttonSaveLigitants.DoClick = function ()
                if(file.Exists("Trial", "DATA")) then
                    if(file.Exists("Trial/Trial.txt", "DATA")) then
                        local f = file.Open( "Trial/Trial.txt", "w", "DATA" )
                            for k,v in ipairs(CharList) do
                                for k,v in ipairs(v) do
                                    file.Append( "Trial/Trial.txt", v )
                                    file.Append( "Trial/Trial.txt", "\n" )
                                end
                            end
                        f:Close()
                    else
                        local f = file.Open( "Trial/Trial.txt", "w", "DATA" )
                            for k,v in ipairs(CharList) do
                                for k,v in ipairs(v) do
                                    file.Append( "Trial/Trial.txt", v )
                                    file.Append( "Trial/Trial.txt", "\n" )
                                end
                            end
                        f:Close()
                    end
                else
                    file.CreateDir("Trial")
                    local f = file.Open( "Trial/Trial.txt", "w", "DATA" )
                        for k,v in ipairs(CharList) do
                            for k,v in ipairs(v) do
                                file.Append( "Trial/Trial.txt", v )
                                file.Append( "Trial/Trial.txt", "\n" )
                            end
                        end
                    f:Close()
                end
                net.Start("SendCharList")
                net.WriteTable(CharList)
                net.SendToServer()
            end

            buttonLoadLigitants.DoClick = function ()
                if(file.Exists("Trial", "DATA")) then
                    if(file.Exists("Trial/Trial.txt", "DATA")) then
                        local value = file.Open( "Trial/Trial.txt", "r","DATA")
                        for k,v in ipairs(CharList[1]) do
                            CharList[1][k] = value:ReadLine():gsub("\n", "")
                        end
                    end
                end
                net.Start("SendCharList")
                net.WriteTable(CharList)
                net.SendToServer()
                local counterLigitants = 1
                for i=0,3 do
                    for j =0,3 do
                        textEntrysLigitants[counterLigitants]:SetText(CharList[1][i*4+j+1])
                        lifeLigitants[counterLigitants]:SetChecked(CharList[2][i*4+j+1])
                        dieChapter[counterLigitants]:SetChecked(CharList[3][i*4+j+1])
                        buttonsIconLigitants[counterLigitants]:SetImage("materials/sprites/Face/"..textEntrysLigitants[counterLigitants]:GetText()..".png")
                        counterLigitants = counterLigitants+1
                    end
                end
            end

            buttonEditor.DoClick = function()
                local numberChar = 0
                local listNames = {}
                for i=0, 15 do
                    listNames[i] = CharList[1][i+1]
                end
                local listImages = {}

                local editorLigitantsFrame = mainWindow:Add("DFrame")
                editorLigitantsFrame:SetPos(mainWindow:GetX(),mainWindow:GetY())
                editorLigitantsFrame:SetSize(mainWindow:GetSize())
                editorLigitantsFrame:MakePopup()

                local scrollFastLigitants = editorLigitantsFrame:Add("DScrollPanel")
                scrollFastLigitants:SetSize(editorLigitantsFrame:GetWide()/10,editorLigitantsFrame:GetTall())
                scrollFastLigitants:SetPos(editorLigitantsFrame:GetX()*9,editorLigitantsFrame:GetY()/4)

                local counterLigitantsEditor = 0
                local counterLigitants = 1
                local buttonsCharTable = {}
                local countCharTable = 0

                for i=0,3 do
                    for j=0,3 do
                        local iconLigitant = scrollFastLigitants:Add("DImageButton")
                        iconLigitant:SetSize(scrollFastLigitants:GetWide()/1.8,scrollFastLigitants:GetWide()/1.8)
                        iconLigitant:SetPos(iconLigitant:GetX(),counterLigitantsEditor)
                        iconLigitant:SetImage("materials/sprites/Face/"..textEntrysLigitants[counterLigitants]:GetText()..".png")
                        local countNumberChar = countCharTable
                        iconLigitant.DoClick = function()
                            numberChar = countNumberChar-1
                        end
                        countNumberChar = countNumberChar + 1
                        counterLigitantsEditor = counterLigitantsEditor+iconLigitant:GetTall()
                        counterLigitants = counterLigitants+1
                        buttonsCharTable[countCharTable] = iconLigitant
                        countCharTable = countCharTable+1
                    end
                end

                local scrollGroupLigitants = editorLigitantsFrame:Add("DScrollPanel")
                scrollGroupLigitants:SetSize(editorLigitantsFrame:GetWide()/8,editorLigitantsFrame:GetTall())
                scrollGroupLigitants:SetPos(editorLigitantsFrame:GetX()/4,editorLigitantsFrame:GetY()/4)

                local firstRonpaButton = scrollGroupLigitants:Add("DImageButton")
                firstRonpaButton:SetSize(scrollGroupLigitants:GetWide(),scrollGroupLigitants:GetTall()/10)
                firstRonpaButton:SetPos(firstRonpaButton:GetX(),firstRonpaButton:GetY())
                firstRonpaButton:SetImage("Selector/THH.png")

                local secondRonpaButton = scrollGroupLigitants:Add("DImageButton")
                secondRonpaButton:SetSize(scrollGroupLigitants:GetWide(),scrollGroupLigitants:GetTall()/10)
                secondRonpaButton:SetPos(secondRonpaButton:GetX(),secondRonpaButton:GetY()+firstRonpaButton:GetTall())
                secondRonpaButton:SetImage("Selector/GD.png")

                local thirdRonpaButton = scrollGroupLigitants:Add("DImageButton")
                thirdRonpaButton:SetSize(scrollGroupLigitants:GetWide(),scrollGroupLigitants:GetTall()/10)
                thirdRonpaButton:SetPos(secondRonpaButton:GetX(),secondRonpaButton:GetY()+secondRonpaButton:GetTall())
                thirdRonpaButton:SetImage("Selector/V3.png")

                local SDRAButton = scrollGroupLigitants:Add("DImageButton")
                SDRAButton:SetSize(scrollGroupLigitants:GetWide(),scrollGroupLigitants:GetTall()/10)
                SDRAButton:SetPos(thirdRonpaButton:GetX(),thirdRonpaButton:GetY()+thirdRonpaButton:GetTall())
                SDRAButton:SetImage("Selector/SDRA.png")

                local RebirthButton = scrollGroupLigitants:Add("DImageButton")
                RebirthButton:SetSize(scrollGroupLigitants:GetWide(),scrollGroupLigitants:GetTall()/10)
                RebirthButton:SetPos(SDRAButton:GetX(),SDRAButton:GetY()+SDRAButton:GetTall())
                RebirthButton:SetImage("Selector/Rebirth.png")

                local FButton = scrollGroupLigitants:Add("DImageButton")
                FButton:SetSize(scrollGroupLigitants:GetWide(),scrollGroupLigitants:GetTall()/10)
                FButton:SetPos(RebirthButton:GetX(),RebirthButton:GetY()+RebirthButton:GetTall())
                FButton:SetImage("Selector/shattered.png")

                local OtherButton = scrollGroupLigitants:Add("DImageButton")
                OtherButton:SetSize(scrollGroupLigitants:GetWide(),scrollGroupLigitants:GetTall()/10)
                OtherButton:SetPos(FButton:GetX(),FButton:GetY()+FButton:GetTall())
                OtherButton:SetImage("Selector/OtherCharacter.png")

                local iconsScrollLigitants = editorLigitantsFrame:Add("DScrollPanel")
                iconsScrollLigitants:SetSize(editorLigitantsFrame:GetWide()-scrollFastLigitants:GetWide()*2-scrollGroupLigitants:GetWide()*2,editorLigitantsFrame:GetTall()/1.5)
                iconsScrollLigitants:SetPos(scrollGroupLigitants:GetX()+scrollGroupLigitants:GetWide()*2,editorLigitantsFrame:GetY()/4)

                local maleCharacters = iconsScrollLigitants:Add("DPanel")
                maleCharacters:SetSize(iconsScrollLigitants:GetWide(),iconsScrollLigitants:GetTall()/2.2)
                maleCharacters.Paint = function()
                    draw.RoundedBox( 8, maleCharacters:GetX(),iconsScrollLigitants:GetY(), maleCharacters:GetWide(),maleCharacters:GetTall(), Color( 102, 102, 255 ) )
                end

                local femaleCharacters = iconsScrollLigitants:Add("DPanel")
                femaleCharacters:SetPos(femaleCharacters:GetX(),iconsScrollLigitants:GetY()+maleCharacters:GetTall())
                femaleCharacters:SetSize(iconsScrollLigitants:GetWide(),iconsScrollLigitants:GetTall()/2.2)
                femaleCharacters.Paint = function()
                    draw.RoundedBox( 8, femaleCharacters:GetX(),iconsScrollLigitants:GetY(), femaleCharacters:GetWide(),femaleCharacters:GetTall(), Color( 241, 156, 187 ) )
                end

                local counterIcons = maleCharacters:GetX()+maleCharacters:GetWide()/6
                local countChar = 0
                local buttonsEditCharTable = {}

                counterLigitants = 1
                for i=1,2 do
                    counterIcons = maleCharacters:GetX()+maleCharacters:GetWide()/6
                    for j=0,3 do
                        local iconLigitant = maleCharacters:Add("DImageButton")
                        iconLigitant:SetSize(scrollFastLigitants:GetWide()/1.8,scrollFastLigitants:GetWide()/1.8)
                        iconLigitant:SetPos(counterIcons,iconLigitant:GetY()+i*i*maleCharacters:GetTall()/8)
                        iconLigitant:SetImage("materials/sprites/Face/"..textEntrysLigitants[counterLigitants]:GetText()..".png")
                        iconLigitant.DoClick = function()
                            buttonsCharTable[numberChar]:SetImage(iconLigitant:GetImage())
                            listNames[numberChar] = string.gsub(string.gsub(iconLigitant:GetImage(),"materials/sprites/Face/", ""),".png","")
                            if(numberChar==15) then
                                numberChar=0
                            else
                                numberChar=numberChar+1
                            end
                        end
                        buttonsEditCharTable[countChar] = iconLigitant
                        countChar = countChar+1
                        counterIcons = counterIcons+iconLigitant:GetWide()*2
                        counterLigitants = counterLigitants+1
                    end
                end

                for i=1,2 do
                    counterIcons = femaleCharacters:GetX()+femaleCharacters:GetWide()/6
                    for j=0,3 do
                        local iconLigitant = femaleCharacters:Add("DImageButton")
                        iconLigitant:SetSize(scrollFastLigitants:GetWide()/1.8,scrollFastLigitants:GetWide()/1.8)
                        iconLigitant:SetPos(counterIcons,iconLigitant:GetY()+i*i*femaleCharacters:GetTall()/8)
                        iconLigitant:SetImage("materials/sprites/Face/"..textEntrysLigitants[counterLigitants]:GetText()..".png")
                        iconLigitant.DoClick = function()
                            buttonsCharTable[numberChar]:SetImage(iconLigitant:GetImage())
                            listNames[numberChar] = string.gsub(string.gsub(iconLigitant:GetImage(),"materials/sprites/Face/", ""),".png","")
                            if(numberChar==15) then
                                numberChar=0
                            else
                                numberChar=numberChar+1
                            end
                        end
                        buttonsEditCharTable[countChar] = iconLigitant
                        countChar = countChar+1
                        counterIcons = counterIcons+iconLigitant:GetWide()*2
                        counterLigitants = counterLigitants+1
                    end
                end

                firstRonpaButton.DoClick = function()
                    buttonsEditCharTable[0]:SetImage("materials/sprites/Face/Makoto.png")
                    buttonsEditCharTable[1]:SetImage("materials/sprites/Face/Byakuya.png")
                    buttonsEditCharTable[2]:SetImage("materials/sprites/Face/Kiyotaka.png")
                    buttonsEditCharTable[3]:SetImage("materials/sprites/Face/Mondo.png")
                    buttonsEditCharTable[4]:SetImage("materials/sprites/Face/Leon.png")
                    buttonsEditCharTable[5]:SetImage("materials/sprites/Face/Yasuhiro.png")
                    buttonsEditCharTable[6]:SetImage("materials/sprites/Face/Hifumi.png")
                    buttonsEditCharTable[7]:SetImage("materials/sprites/Face/Chihiro.png")
                    buttonsEditCharTable[8]:SetImage("materials/sprites/Face/Aoi.png")
                    buttonsEditCharTable[9]:SetImage("materials/sprites/Face/Junko.png")
                    buttonsEditCharTable[10]:SetImage("materials/sprites/Face/Kyoko.png")
                    buttonsEditCharTable[11]:SetImage("materials/sprites/Face/Mukuro.png")
                    buttonsEditCharTable[12]:SetImage("materials/sprites/Face/Sakura.png")
                    buttonsEditCharTable[13]:SetImage("materials/sprites/Face/Sayaka.png")
                    buttonsEditCharTable[14]:SetImage("materials/sprites/Face/Celestia.png")
                    buttonsEditCharTable[15]:SetImage("materials/sprites/Face/Toko.png")
                end

                secondRonpaButton.DoClick = function()
                    buttonsEditCharTable[0]:SetImage("materials/sprites/Face/Hajime.png")
                    buttonsEditCharTable[1]:SetImage("materials/sprites/Face/Imposter.png")
                    buttonsEditCharTable[2]:SetImage("materials/sprites/Face/Gundham.png")
                    buttonsEditCharTable[3]:SetImage("materials/sprites/Face/Kazuichi.png")
                    buttonsEditCharTable[4]:SetImage("materials/sprites/Face/Nagito.png")
                    buttonsEditCharTable[5]:SetImage("materials/sprites/Face/Nekomaru.png")
                    buttonsEditCharTable[6]:SetImage("materials/sprites/Face/Teruteru.png")
                    buttonsEditCharTable[7]:SetImage("materials/sprites/Face/Fuyuhiko.png")
                    buttonsEditCharTable[8]:SetImage("materials/sprites/Face/Akane.png")
                    buttonsEditCharTable[9]:SetImage("materials/sprites/Face/Ibuki.png")
                    buttonsEditCharTable[10]:SetImage("materials/sprites/Face/Mahiru.png")
                    buttonsEditCharTable[11]:SetImage("materials/sprites/Face/Mikan.png")
                    buttonsEditCharTable[12]:SetImage("materials/sprites/Face/Peko.png")
                    buttonsEditCharTable[13]:SetImage("materials/sprites/Face/Sonia.png")
                    buttonsEditCharTable[14]:SetImage("materials/sprites/Face/Hiyoko.png")
                    buttonsEditCharTable[15]:SetImage("materials/sprites/Face/Chiaki.png")
                end

                thirdRonpaButton.DoClick = function()
                    buttonsEditCharTable[0]:SetImage("materials/sprites/Face/Shuichi.png")
                    buttonsEditCharTable[1]:SetImage("materials/sprites/Face/Kaito.png")
                    buttonsEditCharTable[2]:SetImage("materials/sprites/Face/Kokichi.png")
                    buttonsEditCharTable[3]:SetImage("materials/sprites/Face/Korekiyo.png")
                    buttonsEditCharTable[4]:SetImage("materials/sprites/Face/Rantaro.png")
                    buttonsEditCharTable[5]:SetImage("materials/sprites/Face/Ryoma.png")
                    buttonsEditCharTable[6]:SetImage("materials/sprites/Face/Gonta.png")
                    buttonsEditCharTable[7]:SetImage("materials/sprites/Face/K1-B0.png")
                    buttonsEditCharTable[8]:SetImage("materials/sprites/Face/Kaede.png")
                    buttonsEditCharTable[9]:SetImage("materials/sprites/Face/Angie.png")
                    buttonsEditCharTable[10]:SetImage("materials/sprites/Face/Kirumi.png")
                    buttonsEditCharTable[11]:SetImage("materials/sprites/Face/Maki.png")
                    buttonsEditCharTable[12]:SetImage("materials/sprites/Face/Miu.png")
                    buttonsEditCharTable[13]:SetImage("materials/sprites/Face/Tenko.png")
                    buttonsEditCharTable[14]:SetImage("materials/sprites/Face/Himiko.png")
                    buttonsEditCharTable[15]:SetImage("materials/sprites/Face/Tsumugi.png")
                end

                SDRAButton.DoClick = function()
                    buttonsEditCharTable[0]:SetImage("materials/sprites/Face/Yuki.png")
                    buttonsEditCharTable[1]:SetImage("materials/sprites/Face/Mikado.png")
                    buttonsEditCharTable[2]:SetImage("materials/sprites/Face/Makunouchi.png")
                    buttonsEditCharTable[3]:SetImage("materials/sprites/Face/Nikei.png")
                    buttonsEditCharTable[4]:SetImage("materials/sprites/Face/Shinji.png")
                    buttonsEditCharTable[5]:SetImage("materials/sprites/Face/Shobai.png")
                    buttonsEditCharTable[6]:SetImage("materials/sprites/Face/Teruya.png")
                    buttonsEditCharTable[7]:SetImage("materials/sprites/Face/Yuri.png")
                    buttonsEditCharTable[8]:SetImage("materials/sprites/Face/Sora.png")
                    buttonsEditCharTable[9]:SetImage("materials/sprites/Face/Emma.png")
                    buttonsEditCharTable[10]:SetImage("materials/sprites/Face/Hibiki.png")
                    buttonsEditCharTable[11]:SetImage("materials/sprites/Face/Iroha.png")
                    buttonsEditCharTable[12]:SetImage("materials/sprites/Face/Kanade.png")
                    buttonsEditCharTable[13]:SetImage("materials/sprites/Face/Kokoro.png")
                    buttonsEditCharTable[14]:SetImage("materials/sprites/Face/Setsuka.png")
                    buttonsEditCharTable[15]:SetImage("materials/sprites/Face/Yoruko.png")
                end

                RebirthButton.DoClick = function()
                    buttonsEditCharTable[0]:SetImage("materials/sprites/Face/Ayumu.png")
                    buttonsEditCharTable[1]:SetImage("materials/sprites/Face/Akira.png")
                    buttonsEditCharTable[2]:SetImage("materials/sprites/Face/Kazuomi.png")
                    buttonsEditCharTable[3]:SetImage("materials/sprites/Face/Kego.png")
                    buttonsEditCharTable[4]:SetImage("materials/sprites/Face/Mitsunari.png")
                    buttonsEditCharTable[5]:SetImage("materials/sprites/Face/Saiji.png")
                    buttonsEditCharTable[6]:SetImage("materials/sprites/Face/Seishi.png")
                    buttonsEditCharTable[7]:SetImage("aaa/empty")
                    buttonsEditCharTable[8]:SetImage("materials/sprites/Face/Aruma.png")
                    buttonsEditCharTable[9]:SetImage("materials/sprites/Face/Kasumi.png")
                    buttonsEditCharTable[10]:SetImage("materials/sprites/Face/Maiko.png")
                    buttonsEditCharTable[11]:SetImage("materials/sprites/Face/Marin.png")
                    buttonsEditCharTable[12]:SetImage("materials/sprites/Face/Misuzu.png")
                    buttonsEditCharTable[13]:SetImage("materials/sprites/Face/Mikoto.png")
                    buttonsEditCharTable[14]:SetImage("materials/sprites/Face/Narumi.png")
                    buttonsEditCharTable[15]:SetImage("materials/sprites/Face/Nico.png")
                end

                FButton.DoClick = function()
                    buttonsEditCharTable[0]:SetImage("materials/sprites/Face/Enigma.png")
                    buttonsEditCharTable[1]:SetImage("materials/sprites/Face/Cross.png")
                    buttonsEditCharTable[2]:SetImage("materials/sprites/Face/Rock.png")
                    buttonsEditCharTable[3]:SetImage("materials/sprites/Face/Anon.png")
                    buttonsEditCharTable[4]:SetImage("materials/sprites/Face/Pocket.png")
                    buttonsEditCharTable[5]:SetImage("materials/sprites/Face/Corza.png")
                    buttonsEditCharTable[6]:SetImage("materials/sprites/Face/Twin.png")
                    buttonsEditCharTable[7]:SetImage("materials/sprites/Face/Grisp.png")
                    buttonsEditCharTable[8]:SetImage("materials/sprites/Face/Moraiteru.png")
                    buttonsEditCharTable[9]:SetImage("materials/sprites/Face/Cancel.png")
                    buttonsEditCharTable[10]:SetImage("materials/sprites/Face/Rox.png")
                    buttonsEditCharTable[11]:SetImage("materials/sprites/Face/Scarlet.png")
                    buttonsEditCharTable[12]:SetImage("materials/sprites/Face/Rissi.png")
                    buttonsEditCharTable[13]:SetImage("materials/sprites/Face/Yaxi.png")
                    buttonsEditCharTable[14]:SetImage("aaa/empty")
                    buttonsEditCharTable[15]:SetImage("aaa/empty")
                end

                OtherButton.DoClick = function()
                    buttonsEditCharTable[0]:SetImage("materials/sprites/Face/Ryota.png")
                    buttonsEditCharTable[1]:SetImage("materials/sprites/Face/Monokuma.png")
                    buttonsEditCharTable[2]:SetImage("aaa/empty")
                    buttonsEditCharTable[3]:SetImage("aaa/empty")
                    buttonsEditCharTable[4]:SetImage("aaa/empty")
                    buttonsEditCharTable[5]:SetImage("aaa/empty")
                    buttonsEditCharTable[6]:SetImage("aaa/empty")
                    buttonsEditCharTable[7]:SetImage("aaa/empty")
                    buttonsEditCharTable[8]:SetImage("materials/sprites/Face/Ryoko.png")
                    buttonsEditCharTable[9]:SetImage("materials/sprites/Face/Komaru.png")
                    buttonsEditCharTable[10]:SetImage("aaa/empty")
                    buttonsEditCharTable[11]:SetImage("aaa/empty")
                    buttonsEditCharTable[12]:SetImage("aaa/empty")
                    buttonsEditCharTable[13]:SetImage("aaa/empty")
                    buttonsEditCharTable[14]:SetImage("aaa/empty")
                    buttonsEditCharTable[15]:SetImage("aaa/empty")
                end

                buttonSaveChars = editorLigitantsFrame:Add("DButton")
                buttonSaveChars:SetPos(editorLigitantsFrame:GetX()+scrollGroupLigitants:GetWide(),editorLigitantsFrame:GetY()+editorLigitantsFrame:GetTall()/1.5)
                buttonSaveChars:SetSize(editorLigitantsFrame:GetWide()/10,editorLigitantsFrame:GetTall()/10)
                buttonSaveChars:SetText("Сохранить")
                buttonSaveChars:SetFont("DDFFont")
                    --buttonSaveChars:SetTextColor(Color(0,0,0))
                buttonSaveChars.DoClick = function()
                    for i=0,15 do
                        CharList[1][i+1] = listNames[i]
                        buttonsIconLigitants[i+1]:SetImage(buttonsCharTable[i]:GetImage())
                        textEntrysLigitants[i+1]:SetText(listNames[i])
                    end
                    CharList[1][16] = listNames[15]
                    net.Start("SendCharList")
                    net.WriteTable(CharList)
                    net.SendToServer()
                    editorLigitantsFrame:Close()
                end

            end



            local beginCount = mainWindow:Add("DButton")
            beginCount:SetSize(mainWindow:GetWide()/8,mainWindow:GetTall()/12)
            beginCount:SetPos(mainWindow:GetX()/3, mainWindow:GetY()/1.5)
            beginCount:SetText("Начать суд")
            beginCount:SetFont("DDFFont")
                --beginCount:SetTextColor(Color(0,0,0))

            local endCount = mainWindow:Add("DButton")
            endCount:SetSize(mainWindow:GetWide()/8,mainWindow:GetTall()/12)
            endCount:SetPos(mainWindow:GetX()/3, mainWindow:GetY()*1.8)
            endCount:SetEnabled(false)
            endCount:SetText("Закончить суд")
            endCount:SetFont("DDFFont")
                --endCount:SetTextColor(Color(0,0,0))

            buttonVoting.DoClick = function()
                net.Start("SendCharList")
                net.WriteTable(CharList)
                net.SendToServer()
                timer.Simple(0.01, function()
                    net.Start("StartVoting")
                    net.SendToServer()
                    if(countOn==true) then
                        beginCount:SetEnabled(true)
                        endCount:SetEnabled(false)
                        countOn = false
                    end
                end)
            end

            local onePlayerButton = mainWindow:Add("DButton")
            onePlayerButton:SetSize(mainWindow:GetWide()/8,mainWindow:GetTall()/12)
            onePlayerButton:SetPos(mainWindow:GetX()/3, mainWindow:GetY()*3)
            onePlayerButton:SetText("Выполнить")
            onePlayerButton:SetFont("DDFFont")
                --onePlayerButton:SetTextColor(Color(0,0,0))

            local nameText = mainWindow:Add("DComboBox")
            nameText:SetPos(mainWindow:GetX()/3, mainWindow:GetY()*4)
            nameText:SetSize(mainWindow:GetWide()/8,mainWindow:GetTall()/40)
            nameText:SetValue( "Игроки" )
            for k,v in ipairs(player.GetAll()) do
                steamworks.RequestPlayerInfo( v:SteamID64(), function( steamName )
                    nameText:AddChoice(v:Nick() .." " .. steamName, v:SteamID())
                end )
            end

            local operationBox = mainWindow:Add("DComboBox")
            operationBox:SetPos(mainWindow:GetX()/3, mainWindow:GetY()*4.5)
            operationBox:SetSize(mainWindow:GetWide()/8,mainWindow:GetTall()/40)
            operationBox:SetValue( "Операция" )
            operationBox:AddChoice("Начать суд", 1)
            operationBox:AddChoice("Закончить суд", 2)
            operationBox:AddChoice("Перезапустить суд", 3)

            local investegetionButton = mainWindow:Add("DButton")
            investegetionButton:SetSize(mainWindow:GetWide()/8,mainWindow:GetTall()/12)
            investegetionButton:SetPos(mainWindow:GetX()/3, mainWindow:GetY()*5)
            investegetionButton:SetText("Расследование")
            investegetionButton:SetFont("DDFFont")
                --investegetionButton:SetTextColor(Color(0,0,0))

            local cleanEvidencesButton = mainWindow:Add("DButton")
            cleanEvidencesButton:SetSize(mainWindow:GetWide()/8,mainWindow:GetTall()/12)
            cleanEvidencesButton:SetPos(mainWindow:GetX()/3, mainWindow:GetY()*6.2)
            cleanEvidencesButton:SetText("Очистить улики")
            cleanEvidencesButton:SetFont("DDFFont")
                --cleanEvidencesButton:SetTextColor(Color(0,0,0))

            local openAllDoorsButton = mainWindow:Add("DButton")
            openAllDoorsButton:SetSize(mainWindow:GetWide()/8,mainWindow:GetTall()/12)
            openAllDoorsButton:SetPos(cleanEvidencesButton:GetX(), cleanEvidencesButton:GetY()+ cleanEvidencesButton:GetTall()*1.5)
            openAllDoorsButton:SetText("Ревёрс дверей")
            openAllDoorsButton:SetFont("DDFFont")

            if(countOn==false) then
                beginCount:SetEnabled(true)
                endCount:SetEnabled(false)
            else
                beginCount:SetEnabled(false)
                endCount:SetEnabled(true)
            end

            beginCount.DoClick = function()
                beginCount:SetEnabled(false)
                endCount:SetEnabled(true)
                countOn = true
                net.Start("SendMessageToStartTrial")
                net.SendToServer()
                net.Start("CountServer")
                net.WriteBool(countOn)
                net.SendToServer()
            end

            endCount.DoClick = function()
                beginCount:SetEnabled(true)
                endCount:SetEnabled(false)
                countOn = false
                net.Start("SendMessageToEndTrial")
                net.SendToServer()
                net.Start("CountServer")
                net.WriteBool(countOn)
                net.SendToServer()
            end

            onePlayerButton.DoClick = function()
                if(operationBox:GetSelectedID()==1) then
                    net.Start("StartSingleTrial")
                    net.WriteString(nameText:GetOptionData(nameText:GetSelectedID()))
                    net.SendToServer()
                end

                if(operationBox:GetSelectedID()==2) then
                    net.Start("EndSingleTrial")
                    net.WriteString(nameText:GetOptionData(nameText:GetSelectedID()))
                    net.SendToServer()
                end

                if(operationBox:GetSelectedID()==3) then
                    net.Start("RestartTrial")
                    net.WriteString(nameText:GetOptionData(nameText:GetSelectedID()))
                    net.SendToServer()
                end
            end

            investegetionButton.DoClick = function()
                net.Start("StartInvestigating")
                net.SendToServer()
            end

            cleanEvidencesButton.DoClick = function()
                net.Start("SendMessageToCleanEvidences")
                net.SendToServer()
            end

            openAllDoorsButton.DoClick = function()
                net.Start("OpenAllDoors")
                net.SendToServer()
            end

        end
    end
end)

net.Receive("ChangeCharList2", function ()
    CharList = net.ReadTable()
    end)

net.Receive("StartInvestigating1", function ()
    local investigation1 = vgui.Create("DImage")
    investigation1:SetImage("materials/sprites/UI/voting/investigation2.png")
    investigation1:SetSize(ScrW(),ScrH())
    local investigation2 = vgui.Create("DImage")
    investigation2:SetImage("materials/sprites/UI/voting/investigation1.png")
    investigation2:SetSize(ScrW(),ScrH())
    investigation2:SetPos(ScrW(),0)
    investigation1:SetAlpha(0)
    investigation1:AlphaTo(255, 1, 0, function ()
        surface.PlaySound("voting/Investigation sound.mp3")
        investigation2:MoveTo(25, 0, 0.25, 0, -1, function ()
            investigation2:MoveTo(-25, 0, 1, 0, -1, function ()
                investigation2:MoveTo(-ScrW(), 0, 0.25, 0, -1, function ()
                    investigation1:AlphaTo(0, 1, 0, function ()
                        investigation1:Remove()
                        investigation2:Remove()
                    end)
                end)
            end)
        end)
    end)
end)

local single = true
hook.Add("PlayerButtonDown", "VotingClient", function (ply, button)
    if button == 46 then
        if single == true then
            single = false
            if ply:IsSuperAdmin() then
                net.Start("ChangeCharList")
                net.SendToServer()
                    timer.Simple(0.01, function()
                    single = true
                end)
            end
        end
    end
end)


local ui = nil
local Char = "Nagito"
local function GrowAlpha(panel, from, to, speed)
    if panel ~= nil then
        if (from <= to) then
            if(panel:IsValid()) then
                panel:SetImageColor(Color(255,255,255,from))
                timer.Simple(0.01, function()
                    GrowAlpha(panel, from+speed, to, speed)
                end)
            end
        end
    end
end

local function LowAlpha(panel, from, to, speed)
    if panel ~= nil then
        if (from >= to) then
            if(panel:IsValid()) then
                panel:SetImageColor(Color(255,255,255,from))
                timer.Simple(0.01, function()
                    LowAlpha(panel, from-speed*2,to, speed)
                end)
            end
        end
    end
end

local chars = {{},{}}
local function ShowAllChars()
    for i = 1,16 do
        if chars[1][i] ~= nil then
            GrowAlpha(chars[1][i], 0,255,5)
        end
        if chars[2][i] ~= nil then 
            GrowAlpha(chars[2][i], 0,255,5)
        end    
    end
end

local function HideAllChars()
    for i = 1,16 do
        timer.Simple(i/16, function()
            if chars[1][i] ~= nil then
                LowAlpha(chars[1][i], 255,-20,10)
                surface.PlaySound("voting/ButtonOff.mp3")
            end
            if chars[2][i] ~= nil then 
                LowAlpha(chars[2][i], 255,-20,10)
            end
        end)     
    end
end

local function SetNumber(number, count)
    number:SetImage("materials/sprites/UI/voting/numbers.png")
end

local endpastseconds = true
local function seconds(des, ed,count)
    if count >= 0 then
        timer.Simple(1, function()
            local sc = count%10
            local fr = (count - sc)/10
            des:SetImage("materials/sprites/UI/voting/numbers/".. fr .. ".png")
            ed:SetImage("materials/sprites/UI/voting/numbers/".. sc .. ".png")
            seconds(des, ed,count-1)
            if count == 0 then
                timer.Simple(1, function()
                    endpastseconds = false
                end)
            end
        end)
    end
end

local function pastseconds(des, ed, count)
    if des ~=nil then
        timer.Simple(0.01, function()
            local sc = math.floor(math.Rand(0, 9))
            local fr = math.floor(math.Rand(0, 9))
            des:SetImage("materials/sprites/UI/voting/numbers/".. fr.. ".png")
            ed:SetImage("materials/sprites/UI/voting/numbers/".. sc.. ".png")
            if endpastseconds == true then
                pastseconds(des, ed, count-1)
            else
                des:SetImage("materials/sprites/UI/voting/numbers/0.png")
                ed:SetImage("materials/sprites/UI/voting/numbers/0.png")
            end
        end)
    end
end

local function StartVoting()
    CloseTrial()
    endpastseconds = true
    Char = GetSpriteFolder(Char)
    local backUI = vgui.Create("DImage")
    ui = backUI
    backUI:SetImage("materials/sprites/UI/voting/UI back.png")
    backUI:SetSize(ScrW(), ScrH())
    GrowAlpha(backUI, 0, 255, 3) 
    
    local Character = vgui.Create("DImage", backUI)
    Character:SetImage("aaa/empty")
    Character:SetSize(ScrW(), ScrH())
    GrowAlpha(Character, 0, 255, 3) 
    local VotingPanel = vgui.Create("DImage", backUI)
    VotingPanel:SetImage("materials/sprites/UI/voting/voting panel.png")
    local PanelSize = ScrH()/10*8
    local TableSize = PanelSize/5
    VotingPanel:SetSize(PanelSize, PanelSize)
    VotingPanel:SetPos(ScrH()/2-PanelSize/2, ScrH()/2-PanelSize/2)
    VotingPanel:MakePopup()
    GrowAlpha(VotingPanel, 0, 255, 3) 
    local VotingButton = vgui.Create("DButton", backUI)   
    VotingButton:SetSize(576, 321)
    VotingButton:SetPos(ScrW()-576, ScrH()-321)
    VotingButton:SetText("")
    VotingButton.Paint = function (self,w,h)
    end
    VotingButton:Hide()
    local VotingButtonImage = vgui.Create("DImage", backUI)
    VotingButtonImage:SetImage("materials/sprites/UI/voting/button.png")
    VotingButtonImage:SetSize(576, 321)
    VotingButtonImage:SetPos(ScrW()-576, ScrH()-321)
    GrowAlpha(VotingButtonImage, 0, 255, 3)
    VotingButtonImage:Hide()
    local globalcount = Char
    local single = true
    local values = {}
    local indexVal = 0
    for i = 0,3 do
        for j = 0,3 do
            if CharList[1][i*4+j+1] ~= "Empty" then
                table.insert(values, {i,j})
                local count = i*4+j+1
                local VotingTable = vgui.Create("DButton", VotingPanel)
                local VotingTableSprite = vgui.Create("DImage", VotingTable)
                chars[1][count] = VotingTableSprite
                VotingTable:SetText("")
                VotingTableSprite:SetImage("materials/sprites/Face/"..CharList[1][count]..".png")
                VotingTableSprite:SetImageColor(Color(255,255,255,0))
                VotingTable:SetSize(TableSize,TableSize)
                VotingTableSprite:SetSize(TableSize,TableSize)
                VotingTable.Paint = function (self,w,h)
                end
                if CharList[2][count] == false then
                    local Dead = vgui.Create("DImage", VotingTable)
                    Dead:SetImage("materials/sprites/UI/voting/dead.png")
                    chars[2][count] = Dead
                    Dead:SetSize(TableSize,TableSize)
                    Dead:SetPos(0,0)
                end
                VotingTable:SetPos(PanelSize/14.814+values[1][2]*(TableSize+PanelSize/40+1)+1,PanelSize/16+values[1][1]*(TableSize+PanelSize/40)+1)
                table.remove(values, 1)
                VotingTable.DoClick = function()
                    if single == true then
                        VotingButtonImage:Show()
                        VotingButton:Show()
                        surface.PlaySound("charactermenu/Pick.mp3")
                        globalcount = count
                        Character:SetImage("materials/sprites/UI/voting/chars/".. CharList[1][count] ..".png")
                    end
                end
            else
                table.insert(values, {i,j})
            end
        end
    end

    ShowAllChars()
    local fr = vgui.Create("DImage", backUI)
    fr:SetSize(0,0)
    fr:SetPos(ScrW() - 340, ScrH() - 125)
    local sc = vgui.Create("DImage", backUI)
    sc:SetSize(0,0)
    sc:SetPos(ScrW() - 300, ScrH() - 125)
    local tr = vgui.Create("DImage", backUI)
    tr:SetSize(0,0)
    tr:SetPos(ScrW() - 250, ScrH() - 125)
    local frs = vgui.Create("DImage", backUI)
    frs:SetSize(0,0)
    frs:SetPos(ScrW() - 210, ScrH() - 125)
    local points = vgui.Create("DImage", backUI)
    points:SetSize(0,0)
    points:SetPos(ScrW() - 275, ScrH() - 125)
    points:SetImage("materials/sprites/UI/voting/numbers/points.png")
    seconds(fr, sc, 20)
    pastseconds(tr, frs, 0)
    VotingButton.DoClick = function()
        if single == true then
            single = false
            surface.PlaySound("voting/PressButton.mp3")
            LowAlpha(Character, 255, -10,4)
            LowAlpha(VotingButtonImage, 255, -10,4)
            HideAllChars()
            net.Start("SendVote")
            net.WriteEntity(LocalPlayer())
            net.WriteFloat(globalcount)
            net.SendToServer()
            VotingButton:Remove()
        end
    end
    VotingButton:MakePopup()
    local voting1 = vgui.Create("DImage")
    voting1:SetImage("materials/sprites/UI/voting/voting.png")
    voting1:SetSize(ScrW(),ScrH())
    voting1:MakePopup()
    local voting2 = vgui.Create("DImage")
    voting2:SetImage("materials/sprites/UI/voting/voting2.png")
    voting2:SetSize(ScrW(),ScrH())
    voting2:SetPos(ScrW(),0)
    voting2:MakePopup()
    voting1:SetAlpha(0)
    voting1:AlphaTo(255, 1, 0, function ()
        surface.PlaySound("voting/OpenVoting.mp3")
        voting2:MoveTo(25, 0, 0.25, 0, -1, function ()
            voting2:MoveTo(-25, 0, 1, 0, -1, function ()
                voting2:MoveTo(-ScrW(), 0, 0.25, 0, -1, function ()
                    voting1:AlphaTo(0, 1, 0, function ()
                        voting1:Remove()
                        voting2:Remove()
                    end)
                end)
            end)
        end)
    end)
    timer.Simple(22, function()
       if single then
            HideAllChars()
        end
        if VotingButtonImage:IsVisible() then
            VotingButtonImage:Hide()
            VotingButton:Remove()
        end
        VotingPanel:SetPopupStayAtBack(true)
        Character:SetImage("materials/sprites/UI/voting/chars/".. Char ..".png")
        Character:MakePopup()

        if LocalPlayer():IsSuperAdmin() then
            print (Char)
        end
        GrowAlpha(Character, 0, 255, 3)
        surface.PlaySound("voting/ShowCulprit2.mp3")
        timer.Simple(2, function()
            surface.PlaySound("voting/TrueCulprit.mp3")
            timer.Simple(5, function()
                LowAlpha(ui, 255,-20,2)
                LowAlpha(Character, 255,-20,2)
                LowAlpha(fr, 255,-20,2)
                LowAlpha(sc, 255,-20,2)
                LowAlpha(tr, 255,-20,2)
                LowAlpha(frs, 255,-20,2)
                LowAlpha(backUI, 255,-20,2)
                LowAlpha(VotingPanel, 255,-20,2)
                LowAlpha(points, 255,-20,2)
                timer.Simple(3, function()
                    single = true
                    ui:Remove()
                end)
            end)
        end)
    end)
end

net.Receive("StartVoting2", function ()
    CharList = net.ReadTable()
    StartVoting()
end)

net.Receive("ShowResults", function ()
    local voted = net.ReadString()
    Char = voted
end)

net.Start("ChangeCountOn")
net.SendToServer()

net.Receive("saveTxtCount",function()
    local tableSprite = net.ReadTable()
    if(file.Exists("CountDDF", "DATA")) then
        if(file.Exists("CountDDF/CountDDF.txt", "DATA")) then
            local f = file.Open( "CountDDF/CountDDF.txt", "w", "DATA" )
                for i =1, #tableSprite do
                    file.Append( "CountDDF/CountDDF.txt", tostring(tableSprite[i][1]) )
                    file.Append( "CountDDF/CountDDF.txt", "\n" )
                    file.Append( "CountDDF/CountDDF.txt", tostring(tableSprite[i][2]) )
                    file.Append( "CountDDF/CountDDF.txt", "\n" )
                end
            f:Close()
        else
            local f = file.Open( "CountDDF/CountDDF.txt", "w", "DATA" )
                for i =1, #tableSprite do
                    file.Append( "CountDDF/CountDDF.txt", tostring(tableSprite[i][1]) )
                    file.Append( "CountDDF/CountDDF.txt", "\n" )
                    file.Append( "CountDDF/CountDDF.txt", tostring(tableSprite[i][2]) )
                    file.Append( "CountDDF/CountDDF.txt", "\n" )
                end
            f:Close()
        end
    else
        file.CreateDir("CountDDF")
        local f = file.Open( "CountDDF/CountDDF.txt", "w", "DATA" )
            for i =1, #tableSprite do
                file.Append( "CountDDF/CountDDF.txt", tostring(tableSprite[i][1]) )
                file.Append( "CountDDF/CountDDF.txt", "\n" )
                file.Append( "CountDDF/CountDDF.txt", tostring(tableSprite[i][2]) )
                file.Append( "CountDDF/CountDDF.txt", "\n" )
            end
        f:Close()
    end 
end)

print("Monomenu saved")