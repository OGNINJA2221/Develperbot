const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { token, clientId } = require('./config.json');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Keep track of pressed members (in-memory, restart will reset)
let pressedMembers = new Set();

// Slash command: setupdev
const commands = [
    new SlashCommandBuilder()
        .setName('setupdev')
        .setDescription('Setup dev groups (Admin only)')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Select members with this role')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('group_size')
                .setDescription('Number of members per group')
                .setRequired(true))
        .toJSON()
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('Slash commands registered.');
    } catch (err) {
        console.error(err);
    }
})();

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

// Interaction handling
client.on('interactionCreate', async interaction => {
    // Button pressed
    if (interaction.isButton()) {
        if (interaction.customId === 'form_dev_group') {
            if (pressedMembers.has(interaction.user.id)) {
                return interaction.reply({ content: 'You already pressed the button!', ephemeral: true });
            }
            pressedMembers.add(interaction.user.id);

            let memberRole = interaction.guild.roles.cache.find(r => r.name === 'member pressed');
            if (!memberRole) {
                memberRole = await interaction.guild.roles.create({ name: 'member pressed', mentionable: false });
            }
            await interaction.member.roles.add(memberRole);
            await interaction.reply({ content: 'You pressed the button! Waiting for groups…', ephemeral: true });
        }

        if (interaction.customId.startsWith('accept_group_')) {
            const groupName = interaction.customId.split('_')[2];
            await interaction.member.send(`Your group is ${groupName}!`);
            await interaction.reply({ content: 'You accepted!', ephemeral: true });
        }
    }

    // Slash command: /setupdev
    if (interaction.isChatInputCommand() && interaction.commandName === 'setupdev') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'Only admins can use this!', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const groupSize = interaction.options.getInteger('group_size');

        const candidates = interaction.guild.members.cache.filter(m =>
            pressedMembers.has(m.id) && m.roles.cache.has(role.id)
        );

        if (candidates.size === 0) {
            return interaction.reply({ content: 'No members pressed the button with that role.', ephemeral: true });
        }

        await interaction.reply({ content: `Found ${candidates.size} members! Creating groups…`, ephemeral: true });

        let membersArray = Array.from(candidates.values());
        let groupCounter = 1;

        while (membersArray.length > 0) {
            const groupMembers = membersArray.splice(0, groupSize);

            const groupRole = await interaction.guild.roles.create({
                name: `Group ${groupCounter} (${role.name})`,
                mentionable: true
            });

            const groupChannel = await interaction.guild.channels.create({
                name: `group-${groupCounter}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    ...groupMembers.map(m => ({ id: m.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }))
                ]
            });

            groupMembers.forEach(m => m.roles.add(groupRole));

            const acceptRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`accept_group_${groupCounter}`)
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Primary)
                );

            const embed = new EmbedBuilder()
                .setTitle(`Group ${groupCounter}`)
                .setDescription(`Hello ${groupMembers.map(m => `<@${m.id}>`).join(', ')}! Press Accept to confirm your group.`);

            await groupChannel.send({ embeds: [embed], components: [acceptRow] });

            groupCounter++;
        }

        interaction.followUp({ content: 'Groups created successfully!', ephemeral: true });
    }
});

// Admin command to initialize the Form Dev Group button
client.on('messageCreate', async message => {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    if (message.content.toLowerCase() === '!initform') {
        const button = new ButtonBuilder()
            .setCustomId('form_dev_group')
            .setLabel('Form Dev Group')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(button);

        const embed = new EmbedBuilder()
            .setTitle('Join Dev Group')
            .setDescription('Press the button below to join the dev group formation pool.');

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

client.login(token);
